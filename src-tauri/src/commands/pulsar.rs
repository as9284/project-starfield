use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{command, ipc::Channel, State};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::{oneshot, Mutex};

// ── State ─────────────────────────────────────────────────────────────────

pub struct PulsarState {
    pub cancel_senders: Arc<Mutex<HashMap<String, oneshot::Sender<()>>>>,
}

impl PulsarState {
    pub fn new() -> Self {
        Self {
            cancel_senders: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

// ── Event types ───────────────────────────────────────────────────────────

/// Events emitted through the IPC channel during a download.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum PulsarEvent {
    /// yt-dlp reported a percentage progress update.
    #[serde(rename = "progress")]
    Progress {
        percent: f32,
        speed: String,
        eta: String,
    },
    /// Currently downloading a playlist item.
    #[serde(rename = "playlistItem")]
    PlaylistItem {
        index: usize,
        total: usize,
        title: String,
    },
    /// yt-dlp is merging video + audio tracks.
    #[serde(rename = "merging")]
    Merging,
    /// Download finished successfully.
    #[serde(rename = "done")]
    Done { file_path: Option<String> },
    /// Download failed or was cancelled.
    #[serde(rename = "error")]
    Error { message: String },
}

// ── Commands ──────────────────────────────────────────────────────────────

/// Check whether yt-dlp is available on the system PATH.
#[command]
pub async fn pulsar_check_ytdlp() -> Result<bool, String> {
    let cmd = if cfg!(target_os = "windows") {
        "where"
    } else {
        "which"
    };
    let output = Command::new(cmd)
        .arg("yt-dlp")
        .output()
        .await
        .map_err(|e| e.to_string())?;
    Ok(output.status.success())
}

/// Get the default downloads directory for the current user.
#[command]
pub fn pulsar_get_downloads_dir() -> Result<String, String> {
    if let Ok(dir) = std::env::var("XDG_DOWNLOAD_DIR") {
        return Ok(dir);
    }
    if let Some(home) = home_dir() {
        let downloads = home.join("Downloads");
        if downloads.is_dir() {
            return Ok(downloads.to_string_lossy().to_string());
        }
        return Ok(home.to_string_lossy().to_string());
    }
    Err("Cannot determine downloads directory".to_string())
}

/// Attempt to auto-install yt-dlp via pip3 or pip.
#[command]
pub async fn pulsar_install_ytdlp() -> Result<bool, String> {
    for pip in &["pip3", "pip"] {
        if let Ok(out) = Command::new(pip)
            .args(["install", "--user", "--upgrade", "yt-dlp"])
            .output()
            .await
        {
            if out.status.success() {
                return Ok(true);
            }
        }
    }
    Ok(false)
}

/// Download media using yt-dlp with real-time progress events.
///
/// `format_arg` — "best" | "audio" | "720" | "1080"
/// `playlist`   — when true, download the full playlist instead of one video
#[command]
pub async fn pulsar_download(
    download_id: String,
    url: String,
    format_arg: String,
    output_dir: String,
    playlist: bool,
    channel: Channel<PulsarEvent>,
    state: State<'_, PulsarState>,
) -> Result<(), String> {
    // Register a cancellation channel for this download
    let (cancel_tx, mut cancel_rx) = oneshot::channel::<()>();
    {
        let mut senders = state.cancel_senders.lock().await;
        senders.insert(download_id.clone(), cancel_tx);
    }

    // Build yt-dlp argument list
    let mut args: Vec<String> = Vec::new();

    // Output template — use a playlist sub-folder when downloading playlists
    let output_template = if playlist {
        format!(
            "{}/%(playlist_title)s/%(playlist_index)s - %(title)s.%(ext)s",
            output_dir
        )
    } else {
        format!("{}/%(title)s.%(ext)s", output_dir)
    };
    args.push("-o".to_string());
    args.push(output_template);

    // Emit one line per progress update (no ANSI carriage-return tricks)
    args.push("--newline".to_string());

    if !playlist {
        args.push("--no-playlist".to_string());
    }

    match format_arg.as_str() {
        "audio" => {
            args.push("-x".to_string());
            args.push("--audio-format".to_string());
            args.push("mp3".to_string());
        }
        "720" => {
            args.push("-f".to_string());
            args.push("bestvideo[height<=720]+bestaudio/best[height<=720]".to_string());
        }
        "1080" => {
            args.push("-f".to_string());
            args.push("bestvideo[height<=1080]+bestaudio/best[height<=1080]".to_string());
        }
        _ => {
            args.push("-f".to_string());
            args.push("bestvideo+bestaudio/best".to_string());
        }
    }

    args.push(url);

    // Spawn yt-dlp
    let mut child = Command::new("yt-dlp")
        .args(&args)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to run yt-dlp: {e}"))?;

    let stdout = child.stdout.take().ok_or("No stdout")?;
    let stderr = child.stderr.take().ok_or("No stderr")?;

    // Pipe both stdout and stderr through a single mpsc channel so we can
    // drive one select loop for both progress parsing and cancellation.
    let (line_tx, mut line_rx) = tokio::sync::mpsc::channel::<String>(256);

    let tx1 = line_tx.clone();
    let stdout_task = tokio::spawn(async move {
        let mut lines = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            if tx1.send(line).await.is_err() {
                break;
            }
        }
    });

    let tx2 = line_tx;
    let stderr_task = tokio::spawn(async move {
        let mut lines = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            if tx2.send(line).await.is_err() {
                break;
            }
        }
    });

    let mut last_file: Option<String> = None;
    let mut all_output: Vec<String> = Vec::new();

    loop {
        tokio::select! {
            line = line_rx.recv() => {
                match line {
                    Some(l) => {
                        all_output.push(l.clone());
                        process_yt_dlp_line(&l, &channel, &mut last_file);
                    }
                    None => break, // both reader tasks finished → process exited
                }
            }
            _ = &mut cancel_rx => {
                // User requested cancellation — kill the child process
                let _ = child.kill().await;
                let _ = child.wait().await;
                stdout_task.abort();
                stderr_task.abort();
                let _ = channel.send(PulsarEvent::Error {
                    message: "Download cancelled".to_string(),
                });
                let mut senders = state.cancel_senders.lock().await;
                senders.remove(&download_id);
                return Ok(());
            }
        }
    }

    // Drain reader tasks and reap the child process
    let _ = stdout_task.await;
    let _ = stderr_task.await;
    let status = child.wait().await.map_err(|e| e.to_string())?;

    {
        let mut senders = state.cancel_senders.lock().await;
        senders.remove(&download_id);
    }

    if status.success() {
        let _ = channel.send(PulsarEvent::Done {
            file_path: last_file,
        });
    } else {
        let combined = all_output.join("\n");
        let _ = channel.send(PulsarEvent::Error {
            message: parse_error_message(&combined),
        });
    }

    Ok(())
}

/// Cancel an active download identified by `download_id`.
#[command]
pub async fn pulsar_cancel_download(
    download_id: String,
    state: State<'_, PulsarState>,
) -> Result<(), String> {
    let mut senders = state.cancel_senders.lock().await;
    if let Some(tx) = senders.remove(&download_id) {
        let _ = tx.send(());
    }
    Ok(())
}

// ── Helpers ───────────────────────────────────────────────────────────────

fn home_dir() -> Option<std::path::PathBuf> {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(std::path::PathBuf::from)
}

/// Inspect one line of yt-dlp output and emit the appropriate event.
fn process_yt_dlp_line(
    line: &str,
    channel: &Channel<PulsarEvent>,
    last_file: &mut Option<String>,
) {
    if line.contains("[download]") && line.contains('%') {
        if let Some(event) = parse_progress_line(line) {
            let _ = channel.send(event);
        }
    } else if line.contains("[download] Destination:") {
        if let Some(path) = line.split("Destination: ").nth(1) {
            *last_file = Some(path.trim().to_string());
        }
    } else if line.contains("Merging formats into") {
        let _ = channel.send(PulsarEvent::Merging);
        if let Some(path) = line.split('"').nth(1) {
            *last_file = Some(path.to_string());
        }
    } else if line.contains("has already been downloaded") {
        if let Some(path) = line.split('"').nth(1) {
            *last_file = Some(path.to_string());
        }
    } else if line.contains("Downloading item") {
        // "[download] Downloading item 2 of 5"
        if let Some(event) = parse_playlist_item_line(line) {
            let _ = channel.send(event);
        }
    }
}

/// Parse a yt-dlp progress line like:
///   `[download]  45.3% of   2.28MiB at   1.23MiB/s ETA 00:01`
fn parse_progress_line(line: &str) -> Option<PulsarEvent> {
    let percent_str = line.split('%').next()?.split_whitespace().last()?;
    let percent: f32 = percent_str.parse().ok()?;

    let speed = line
        .split(" at ")
        .nth(1)
        .and_then(|s| s.split_whitespace().next())
        .unwrap_or("?")
        .to_string();

    let eta = line
        .split("ETA ")
        .nth(1)
        .map(|s| s.trim().to_string())
        .unwrap_or_default();

    Some(PulsarEvent::Progress { percent, speed, eta })
}

/// Parse a line like `[download] Downloading item 2 of 5`
fn parse_playlist_item_line(line: &str) -> Option<PulsarEvent> {
    // Look for "item N of M"
    let after_item = line.split("item ").nth(1)?;
    let mut parts = after_item.split_whitespace();
    let index: usize = parts.next()?.parse().ok()?;
    parts.next(); // "of"
    let total_str = parts.next()?;
    // total might be followed by other words; strip non-numeric suffix
    let total: usize = total_str
        .chars()
        .take_while(|c| c.is_ascii_digit())
        .collect::<String>()
        .parse()
        .ok()?;

    Some(PulsarEvent::PlaylistItem {
        index,
        total,
        title: String::new(), // title isn't on this line; UI fills it in later
    })
}

fn parse_error_message(output: &str) -> String {
    if output.contains("is not a valid URL") || output.contains("Unsupported URL") {
        "That URL doesn't look supported. Try a YouTube, Vimeo, or other supported link."
            .to_string()
    } else if output.contains("Video unavailable") || output.contains("Private video") {
        "This video is unavailable or private.".to_string()
    } else if output.contains("HTTP Error 429") {
        "Rate limited. Wait a moment and try again.".to_string()
    } else if output.contains("Sign in to confirm your age") {
        "Age-restricted content — sign-in required.".to_string()
    } else {
        // Return the last non-empty line as the error
        output
            .lines()
            .rev()
            .find(|l| !l.trim().is_empty())
            .unwrap_or("Download failed.")
            .to_string()
    }
}
