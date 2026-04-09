use serde::{Deserialize, Serialize};
use tauri::command;
use tokio::process::Command;

#[derive(Debug, Serialize, Deserialize)]
pub struct PulsarResult {
    pub success: bool,
    pub message: String,
    pub file_path: Option<String>,
}

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
    // Try XDG / platform-standard download dirs
    if let Ok(dir) = std::env::var("XDG_DOWNLOAD_DIR") {
        return Ok(dir);
    }
    if let Some(home) = home_dir() {
        let downloads = home.join("Downloads");
        if downloads.is_dir() {
            return Ok(downloads.to_string_lossy().to_string());
        }
        // Fallback to home dir itself
        return Ok(home.to_string_lossy().to_string());
    }
    Err("Cannot determine downloads directory".to_string())
}

fn home_dir() -> Option<std::path::PathBuf> {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(std::path::PathBuf::from)
}

/// Download media using yt-dlp.
///
/// `format_arg` should be one of:
///   - "best"        → best video + audio
///   - "audio"       → extract audio only (mp3)
///   - "720"         → max 720p video
///   - "1080"        → max 1080p video
#[command]
pub async fn pulsar_download(
    url: String,
    format_arg: String,
    output_dir: String,
) -> Result<PulsarResult, String> {
    // Build yt-dlp arguments
    let mut args: Vec<String> = Vec::new();

    // Output template
    let output_template = format!("{}/%(title)s.%(ext)s", output_dir);
    args.push("-o".to_string());
    args.push(output_template);

    // No playlist, single video only
    args.push("--no-playlist".to_string());

    // Format selection
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
            // "best" — default
            args.push("-f".to_string());
            args.push("bestvideo+bestaudio/best".to_string());
        }
    }

    // Add URL last
    args.push(url);

    let output = Command::new("yt-dlp")
        .args(&args)
        .output()
        .await
        .map_err(|e| format!("Failed to run yt-dlp: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if output.status.success() {
        // Try to extract the output filename from yt-dlp output
        let file_path = stdout
            .lines()
            .rev()
            .find_map(|line| {
                if line.contains("Merging formats into") || line.contains("has already been downloaded") {
                    line.split('"').nth(1).map(|s| s.to_string())
                } else if line.contains("[download] Destination:") {
                    line.split("Destination: ").nth(1).map(|s| s.trim().to_string())
                } else {
                    None
                }
            });

        Ok(PulsarResult {
            success: true,
            message: "Download complete!".to_string(),
            file_path,
        })
    } else {
        let error_msg = if stderr.contains("is not a valid URL") || stderr.contains("Unsupported URL") {
            "That URL doesn't look supported. Try a YouTube, Vimeo, or other supported link."
        } else if stderr.contains("Video unavailable") || stderr.contains("Private video") {
            "This video is unavailable or private."
        } else if stderr.contains("HTTP Error 429") {
            "Rate limited. Wait a moment and try again."
        } else {
            &stderr
        };

        Ok(PulsarResult {
            success: false,
            message: error_msg.to_string(),
            file_path: None,
        })
    }
}
