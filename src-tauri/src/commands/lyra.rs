use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::command;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

// ── Types ─────────────────────────────────────────────────────────────────

/// A single search result returned from `yt-dlp --dump-json`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LyraSearchResult {
    pub id: String,
    pub title: String,
    pub channel: String,
    pub duration: u64,
    pub thumbnail: String,
    pub view_count: u64,
}

/// Stream URL info returned from `yt-dlp --get-url`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LyraStreamInfo {
    pub video_url: Option<String>,
    pub audio_url: Option<String>,
}

/// Cache size information.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LyraCacheSizes {
    pub music_bytes: u64,
    pub video_bytes: u64,
    pub music_count: u64,
    pub video_count: u64,
}

// ── Helpers ───────────────────────────────────────────────────────────────

fn run_without_console_window(command: &mut Command) -> &mut Command {
    #[cfg(target_os = "windows")]
    {
        command.creation_flags(CREATE_NO_WINDOW);
    }

    command
}

fn home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
}

/// Return the path to the locally bundled yt-dlp binary.
fn get_local_ytdlp_path() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        let local_app_data = std::env::var_os("LOCALAPPDATA")?;
        return Some(
            PathBuf::from(local_app_data)
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

fn get_ytdlp_command() -> String {
    if let Some(p) = get_local_ytdlp_path() {
        if p.exists() {
            return p.to_string_lossy().into_owned();
        }
    }
    "yt-dlp".to_string()
}

/// Base directory for all Lyra caches.
fn lyra_cache_base() -> Result<PathBuf, String> {
    #[cfg(target_os = "windows")]
    {
        if let Some(local) = std::env::var_os("LOCALAPPDATA") {
            return Ok(PathBuf::from(local).join("starfield").join("lyra-cache"));
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        if let Some(home) = home_dir() {
            return Ok(home.join(".cache").join("starfield").join("lyra"));
        }
    }
    Err("Cannot determine cache directory".to_string())
}

fn music_cache_dir() -> Result<PathBuf, String> {
    Ok(lyra_cache_base()?.join("music"))
}

fn video_cache_dir() -> Result<PathBuf, String> {
    Ok(lyra_cache_base()?.join("video"))
}

/// Calculate total size of all files in a directory (non-recursive at one level).
fn dir_size(dir: &PathBuf) -> (u64, u64) {
    let mut total_bytes: u64 = 0;
    let mut count: u64 = 0;
    if dir.is_dir() {
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.flatten() {
                if let Ok(meta) = entry.metadata() {
                    if meta.is_file() {
                        total_bytes += meta.len();
                        count += 1;
                    }
                }
            }
        }
    }
    (total_bytes, count)
}

// ── Commands ──────────────────────────────────────────────────────────────

/// Search YouTube using yt-dlp's search functionality.
/// Returns metadata for each result without downloading.
#[command]
pub async fn lyra_search(query: String, max_results: u32) -> Result<Vec<LyraSearchResult>, String> {
    let ytdlp = get_ytdlp_command();
    let limit = max_results.min(20).max(1);
    let search_query = format!("ytsearch{}:{}", limit, query);

    let mut cmd = Command::new(&ytdlp);
    let child = run_without_console_window(&mut cmd)
        .args([
            "--dump-json",
            "--flat-playlist",
            "--no-download",
            "--no-warnings",
            &search_query,
        ])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .output()
        .await
        .map_err(|e| format!("Failed to run yt-dlp: {e}"))?;

    if !child.status.success() {
        let stderr = String::from_utf8_lossy(&child.stderr);
        return Err(format!("yt-dlp search failed: {}", stderr.trim()));
    }

    let stdout = String::from_utf8_lossy(&child.stdout);
    let mut results = Vec::new();

    for line in stdout.lines() {
        if line.trim().is_empty() {
            continue;
        }
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(line) {
            let id = json["id"].as_str().unwrap_or("").to_string();
            if id.is_empty() {
                continue;
            }
            results.push(LyraSearchResult {
                id,
                title: json["title"].as_str().unwrap_or("Unknown").to_string(),
                channel: json["channel"]
                    .as_str()
                    .or_else(|| json["uploader"].as_str())
                    .unwrap_or("Unknown")
                    .to_string(),
                duration: json["duration"].as_u64().unwrap_or(0),
                thumbnail: json["thumbnail"]
                    .as_str()
                    .or_else(|| {
                        json["thumbnails"]
                            .as_array()
                            .and_then(|t| t.last())
                            .and_then(|t| t["url"].as_str())
                    })
                    .unwrap_or("")
                    .to_string(),
                view_count: json["view_count"].as_u64().unwrap_or(0),
            });
        }
    }

    Ok(results)
}

/// Get a direct stream URL for a YouTube video using yt-dlp.
/// Returns separate video and audio URLs for quality playback.
#[command]
pub async fn lyra_get_stream_url(video_id: String) -> Result<LyraStreamInfo, String> {
    let ytdlp = get_ytdlp_command();
    let url = format!("https://www.youtube.com/watch?v={}", video_id);

    // Try to get audio-only stream URL first
    let mut audio_cmd = Command::new(&ytdlp);
    let audio_output = run_without_console_window(&mut audio_cmd)
        .args([
            "--get-url",
            "-f", "bestaudio",
            "--no-warnings",
            "--no-playlist",
            &url,
        ])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .output()
        .await
        .map_err(|e| format!("Failed to run yt-dlp: {e}"))?;

    let audio_url = if audio_output.status.success() {
        let out = String::from_utf8_lossy(&audio_output.stdout);
        let trimmed = out.trim().to_string();
        if trimmed.is_empty() { None } else { Some(trimmed) }
    } else {
        None
    };

    // Get video+audio combined stream URL
    let mut video_cmd = Command::new(&ytdlp);
    let video_output = run_without_console_window(&mut video_cmd)
        .args([
            "--get-url",
            "-f", "best[height<=1080]",
            "--no-warnings",
            "--no-playlist",
            &url,
        ])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .output()
        .await
        .map_err(|e| format!("Failed to run yt-dlp: {e}"))?;

    let video_url = if video_output.status.success() {
        let out = String::from_utf8_lossy(&video_output.stdout);
        let trimmed = out.trim().to_string();
        // Take only first URL (in case multiple lines)
        let first_line = trimmed.lines().next().unwrap_or("").to_string();
        if first_line.is_empty() { None } else { Some(first_line) }
    } else {
        None
    };

    if audio_url.is_none() && video_url.is_none() {
        return Err("Could not extract stream URLs. The video may be unavailable.".to_string());
    }

    Ok(LyraStreamInfo {
        video_url,
        audio_url,
    })
}

/// Cache an audio track permanently to the music cache directory.
/// Downloads using yt-dlp and returns the path to the cached file.
#[command]
pub async fn lyra_cache_audio(video_id: String, title: String) -> Result<String, String> {
    let cache_dir = music_cache_dir()?;
    std::fs::create_dir_all(&cache_dir)
        .map_err(|e| format!("Failed to create music cache dir: {e}"))?;

    // Check if already cached
    let pattern = format!("{}_", video_id);
    if let Ok(entries) = std::fs::read_dir(&cache_dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with(&pattern) {
                return Ok(entry.path().to_string_lossy().to_string());
            }
        }
    }

    let ytdlp = get_ytdlp_command();
    let url = format!("https://www.youtube.com/watch?v={}", video_id);

    // Sanitize title for filename
    let safe_title: String = title
        .chars()
        .map(|c| if c.is_alphanumeric() || c == ' ' || c == '-' || c == '_' { c } else { '_' })
        .collect();
    let safe_title = safe_title.trim().to_string();
    let output_template = cache_dir
        .join(format!("{}_{}.%(ext)s", video_id, safe_title))
        .to_string_lossy()
        .to_string();

    let mut cmd = Command::new(&ytdlp);
    let output = run_without_console_window(&mut cmd)
        .args([
            "-x",
            "--audio-format", "opus",
            "--audio-quality", "0",
            "-o", &output_template,
            "--no-playlist",
            "--no-warnings",
            &url,
        ])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .output()
        .await
        .map_err(|e| format!("Failed to run yt-dlp: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to cache audio: {}", stderr.trim()));
    }

    // Find the cached file (extension may vary)
    if let Ok(entries) = std::fs::read_dir(&cache_dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with(&pattern) {
                return Ok(entry.path().to_string_lossy().to_string());
            }
        }
    }

    Err("Audio was downloaded but file not found in cache".to_string())
}

/// Cache a video temporarily to the video cache directory.
/// Downloads best quality ≤1080p and returns the path.
#[command]
pub async fn lyra_cache_video(video_id: String, title: String) -> Result<String, String> {
    let cache_dir = video_cache_dir()?;
    std::fs::create_dir_all(&cache_dir)
        .map_err(|e| format!("Failed to create video cache dir: {e}"))?;

    // Check if already cached
    let pattern = format!("{}_", video_id);
    if let Ok(entries) = std::fs::read_dir(&cache_dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with(&pattern) {
                return Ok(entry.path().to_string_lossy().to_string());
            }
        }
    }

    let ytdlp = get_ytdlp_command();
    let url = format!("https://www.youtube.com/watch?v={}", video_id);

    let safe_title: String = title
        .chars()
        .map(|c| if c.is_alphanumeric() || c == ' ' || c == '-' || c == '_' { c } else { '_' })
        .collect();
    let safe_title = safe_title.trim().to_string();
    let output_template = cache_dir
        .join(format!("{}_{}.%(ext)s", video_id, safe_title))
        .to_string_lossy()
        .to_string();

    let mut cmd = Command::new(&ytdlp);
    let output = run_without_console_window(&mut cmd)
        .args([
            "-f", "bestvideo[height<=1080]+bestaudio/best[height<=1080]",
            "-o", &output_template,
            "--no-playlist",
            "--no-warnings",
            &url,
        ])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .output()
        .await
        .map_err(|e| format!("Failed to run yt-dlp: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to cache video: {}", stderr.trim()));
    }

    if let Ok(entries) = std::fs::read_dir(&cache_dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with(&pattern) {
                return Ok(entry.path().to_string_lossy().to_string());
            }
        }
    }

    Err("Video was downloaded but file not found in cache".to_string())
}

/// Check if an audio track is already cached. Returns the path if cached.
#[command]
pub async fn lyra_check_audio_cache(video_id: String) -> Result<Option<String>, String> {
    let cache_dir = music_cache_dir()?;
    let pattern = format!("{}_", video_id);
    if cache_dir.is_dir() {
        if let Ok(entries) = std::fs::read_dir(&cache_dir) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if name.starts_with(&pattern) {
                    return Ok(Some(entry.path().to_string_lossy().to_string()));
                }
            }
        }
    }
    Ok(None)
}

/// Get the sizes of both cache directories.
#[command]
pub async fn lyra_get_cache_sizes() -> Result<LyraCacheSizes, String> {
    let music_dir = music_cache_dir()?;
    let video_dir = video_cache_dir()?;

    let (music_bytes, music_count) = dir_size(&music_dir);
    let (video_bytes, video_count) = dir_size(&video_dir);

    Ok(LyraCacheSizes {
        music_bytes,
        video_bytes,
        music_count,
        video_count,
    })
}

/// Clear the music cache directory.
#[command]
pub async fn lyra_clear_music_cache() -> Result<u64, String> {
    let dir = music_cache_dir()?;
    let (bytes, _) = dir_size(&dir);
    if dir.is_dir() {
        std::fs::remove_dir_all(&dir)
            .map_err(|e| format!("Failed to clear music cache: {e}"))?;
    }
    Ok(bytes)
}

/// Clear the video cache directory.
#[command]
pub async fn lyra_clear_video_cache() -> Result<u64, String> {
    let dir = video_cache_dir()?;
    let (bytes, _) = dir_size(&dir);
    if dir.is_dir() {
        std::fs::remove_dir_all(&dir)
            .map_err(|e| format!("Failed to clear video cache: {e}"))?;
    }
    Ok(bytes)
}
