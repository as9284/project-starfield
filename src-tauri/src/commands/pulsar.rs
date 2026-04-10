use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{command, ipc::Channel, State};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::{oneshot, Mutex};

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

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

fn run_without_console_window(command: &mut Command) -> &mut Command {
    #[cfg(target_os = "windows")]
    {
        command.creation_flags(CREATE_NO_WINDOW);
    }

    command
}

// ── Commands ──────────────────────────────────────────────────────────────

/// Return the path to the locally bundled yt-dlp binary (downloaded by
/// `pulsar_install_ytdlp` when the system-wide one is absent).
fn get_local_ytdlp_path() -> Option<std::path::PathBuf> {
    #[cfg(target_os = "windows")]
    {
        let local_app_data = std::env::var_os("LOCALAPPDATA")?;
        return Some(
            std::path::PathBuf::from(local_app_data)
                .join("starfield")
                .join("bin")
                .join("yt-dlp.exe"),
        );
    }
    #[cfg(not(target_os = "windows"))]
    {
        return Some(home_dir()?.join(".local").join("bin").join("yt-dlp"));
    }
}

/// Return the yt-dlp executable path — local install takes priority so that
/// the auto-downloaded binary is used even when the system hasn't been updated.
fn get_ytdlp_command() -> String {
    if let Some(p) = get_local_ytdlp_path() {
        if p.exists() {
            return p.to_string_lossy().into_owned();
        }
    }
    "yt-dlp".to_string()
}

/// Check whether yt-dlp is available — checks both the system PATH and the
/// local app install directory.
#[command]
pub async fn pulsar_check_ytdlp() -> Result<bool, String> {
    // 1. Check system PATH
    let cmd = if cfg!(target_os = "windows") {
        "where"
    } else {
        "which"
    };
    let mut check_command = Command::new(cmd);
    if let Ok(out) = run_without_console_window(&mut check_command)
        .arg("yt-dlp")
        .output()
        .await
    {
        if out.status.success() {
            return Ok(true);
        }
    }
    // 2. Check local app install location
    if let Some(p) = get_local_ytdlp_path() {
        if p.exists() {
            return Ok(true);
        }
    }
    Ok(false)
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

/// Auto-install yt-dlp.
///
/// * Windows  — downloads the standalone `yt-dlp.exe` from the latest GitHub
///              release directly into `%LOCALAPPDATA%\starfield\bin\`.
/// * Others   — falls back to `pip3` / `pip install --user --upgrade yt-dlp`.
#[command]
pub async fn pulsar_install_ytdlp() -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        use futures_util::StreamExt;

        let local_path = get_local_ytdlp_path()
            .ok_or_else(|| "Cannot locate yt-dlp install path".to_string())?;

        if let Some(parent) = local_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create directory: {e}"))?;
        }

        let client = reqwest::Client::builder()
            .user_agent("Starfield-app/0.1")
            .build()
            .map_err(|e| e.to_string())?;

        let resp = client
            .get("https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe")
            .send()
            .await
            .map_err(|e| format!("Failed to reach GitHub: {e}"))?;

        if !resp.status().is_success() {
            return Err(format!("GitHub returned HTTP {}", resp.status()));
        }

        let mut file = std::fs::File::create(&local_path)
            .map_err(|e| format!("Cannot create file: {e}"))?;

        let mut stream = resp.bytes_stream();
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| format!("Stream error: {e}"))?;
            std::io::Write::write_all(&mut file, &chunk)
                .map_err(|e| format!("Write error: {e}"))?;
        }

        return Ok(true);
    }

    #[cfg(not(target_os = "windows"))]
    {
        for pip in &["pip3", "pip"] {
            let mut install_command = Command::new(pip);
            if let Ok(out) = run_without_console_window(&mut install_command)
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
}

/// Delete a downloaded file (and any leftover .part file) from disk.
#[command]
pub async fn pulsar_delete_file(file_path: String) -> Result<(), String> {
    let path = std::path::Path::new(&file_path);
    if path.exists() {
        std::fs::remove_file(path).map_err(|e| format!("Failed to delete file: {e}"))?;
    }
    // Also remove .part file if it exists
    let part_path_str = format!("{}.part", file_path);
    let part_path = std::path::Path::new(&part_path_str);
    if part_path.exists() {
        let _ = std::fs::remove_file(part_path);
    }
    Ok(())
}

/// Download media using yt-dlp with real-time progress events.
///
/// `format_arg` — "best" | "audio" | "720" | "1080"
/// `audio_format` — "mp3" | "flac" | "wav" | "ogg" | "m4a" | "opus" (used when format_arg is "audio")
/// `playlist`   — when true, download the full playlist instead of one video
#[command]
pub async fn pulsar_download(
    download_id: String,
    url: String,
    format_arg: String,
    audio_format: String,
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
            let af = match audio_format.as_str() {
                "flac" | "wav" | "ogg" | "m4a" | "opus" => audio_format.clone(),
                _ => "mp3".to_string(),
            };
            args.push(af);
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

    // Spawn yt-dlp (prefer locally installed binary)
    let ytdlp_cmd = get_ytdlp_command();
    let mut ytdlp_process = Command::new(&ytdlp_cmd);
    let mut child = run_without_console_window(&mut ytdlp_process)
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
