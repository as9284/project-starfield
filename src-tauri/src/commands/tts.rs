use futures_util::StreamExt;
use hound::{SampleFormat, WavSpec, WavWriter};
use once_cell::sync::OnceCell;
use ort::ep::CPU;
use ort::session::Session;
use ort::session::builder::GraphOptimizationLevel;
use ort::value::Tensor;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::Cursor;
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::RwLock;
use tauri::{command, ipc::Channel, ipc::Response};

// ── espeak-ng auto-install URLs (thewh1teagle/espeakng-loader) ─────────────

#[cfg(target_os = "windows")]
const ESPEAK_NG_LIBS_URL: &str = "https://github.com/thewh1teagle/espeakng-loader/releases/download/v0.1.0/espeak-ng-libs-windows-x86_64.tar.gz";
#[cfg(target_os = "windows")]
const ESPEAK_NG_DATA_URL: &str = "https://github.com/thewh1teagle/espeakng-loader/releases/download/v0.1.0/espeak-ng-data.tar.gz";

// ── Model URLs ───────────────────────────────────────────────────────────────

const MODEL_URL: &str = "https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/onnx/model.onnx";
const VOICE_BASE_URL: &str =
    "https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/voices";
const CONFIG_URL: &str = "https://huggingface.co/hexgrad/Kokoro-82M/resolve/main/config.json";

const MODEL_FILENAME: &str = "model.onnx";
const CONFIG_FILENAME: &str = "config.json";
const SAMPLE_RATE: u32 = 24000;

// ── Voice list (frontend expects these IDs) ──────────────────────────────────

const VOICE_IDS: &[&str] = &["af_heart", "af_bella", "af_nova", "am_adam", "am_onyx"];

// ── Event types ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum TtsDownloadEvent {
    #[serde(rename = "progress")]
    Progress {
        percent: f32,
        downloaded_mb: f32,
        total_mb: f32,
    },
    #[serde(rename = "done")]
    Done,
    #[serde(rename = "error")]
    Error { message: String },
}

// ── Managed state ────────────────────────────────────────────────────────────

pub struct TtsState {
    session: tokio::sync::Mutex<Option<Session>>,
    voices: RwLock<HashMap<String, Vec<f32>>>,
    vocab: OnceCell<HashMap<char, i64>>,
    load_count: AtomicUsize,
    hit_count: AtomicUsize,
}

impl TtsState {
    pub fn new() -> Self {
        Self {
            session: tokio::sync::Mutex::new(None),
            voices: RwLock::new(HashMap::new()),
            vocab: OnceCell::new(),
            load_count: AtomicUsize::new(0),
            hit_count: AtomicUsize::new(0),
        }
    }
}

// ── Storage paths ────────────────────────────────────────────────────────────

fn tts_dir() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        let local = std::env::var_os("LOCALAPPDATA")?;
        return Some(PathBuf::from(local).join("starfield").join("tts"));
    }
    #[cfg(target_os = "macos")]
    {
        let home = std::env::var_os("HOME")?;
        return Some(
            PathBuf::from(home)
                .join("Library")
                .join("Application Support")
                .join("com.stardust.starfield")
                .join("tts"),
        );
    }
    #[cfg(target_os = "linux")]
    {
        let home = std::env::var_os("HOME")?;
        return Some(
            PathBuf::from(home)
                .join(".local")
                .join("share")
                .join("starfield")
                .join("tts"),
        );
    }
}

fn model_path() -> Option<PathBuf> {
    Some(tts_dir()?.join(MODEL_FILENAME))
}

fn voice_path(voice_id: &str) -> Option<PathBuf> {
    Some(tts_dir()?.join("voices").join(format!("{voice_id}.bin")))
}

fn config_path() -> Option<PathBuf> {
    Some(tts_dir()?.join(CONFIG_FILENAME))
}

fn optimized_model_path() -> Option<PathBuf> {
    Some(tts_dir()?.join("model_optimized.onnx"))
}

fn espeak_dir() -> Option<PathBuf> {
    Some(tts_dir()?.join("espeak-ng"))
}

fn espeak_path() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        let dir = espeak_dir()?;
        // First check the expected location
        let expected = dir.join("espeak-ng.exe");
        if expected.exists() {
            return Some(expected);
        }
        // Search recursively for the binary (in case tar has nested structure)
        if let Some(found) = find_espeak_binary(&dir) {
            return Some(found);
        }
        // Fallback to expected path (will trigger re-install)
        Some(expected)
    }
    #[cfg(not(target_os = "windows"))]
    {
        Some(PathBuf::from("espeak-ng"))
    }
}

#[cfg(target_os = "windows")]
fn find_espeak_binary(dir: &PathBuf) -> Option<PathBuf> {
    let entries = std::fs::read_dir(dir).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() {
            if let Some(name) = path.file_name() {
                if name == "espeak-ng.exe" || name == "espeak.exe" {
                    return Some(path);
                }
            }
        } else if path.is_dir() {
            if let Some(found) = find_espeak_binary(&path) {
                return Some(found);
            }
        }
    }
    None
}

#[cfg(target_os = "windows")]
fn find_espeak_data_path() -> Option<PathBuf> {
    let dir = espeak_dir()?;
    // Search for espeak-ng-data directory
    fn search(parent: &PathBuf) -> Option<PathBuf> {
        let entries = std::fs::read_dir(parent).ok()?;
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                if let Some(name) = path.file_name() {
                    if name == "espeak-ng-data" {
                        return Some(parent.clone());
                    }
                }
                if let Some(found) = search(&path) {
                    return Some(found);
                }
            }
        }
        None
    }
    search(&dir).or(Some(dir))
}

// ── espeak-ng auto-install (Windows only) ───────────────────────────────────

#[cfg(target_os = "windows")]
static ESPEAK_VERIFIED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

#[cfg(target_os = "windows")]
async fn ensure_espeak_ng() -> Result<(), String> {
    if ESPEAK_VERIFIED.load(std::sync::atomic::Ordering::Relaxed) {
        return Ok(());
    }

    let exe = espeak_path().ok_or("Cannot determine espeak-ng path")?;
    if exe.exists() {
        // Verify it actually works
        let data_path = find_espeak_data_path().unwrap_or_else(|| espeak_dir().unwrap_or_default());
        let test = tokio::process::Command::new(&exe)
            .args(["-q", "--ipa=1", "-v", "en-us", "test"])
            .env("ESPEAK_DATA_PATH", &data_path)
            .output()
            .await;
        if test.is_ok() && test.unwrap().status.success() {
            ESPEAK_VERIFIED.store(true, std::sync::atomic::Ordering::Relaxed);
            return Ok(());
        }
        println!("[TTS] espeak-ng exists but failed test, re-installing...");
    }

    let dir = espeak_dir().ok_or("Cannot determine espeak-ng dir")?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("Create espeak-ng dir: {e}"))?;

    // Clear any partial/broken installation
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).map_err(|e| format!("Recreate espeak-ng dir: {e}"))?;

    let libs_tar = dir.join("libs.tar.gz");
    let data_tar = dir.join("data.tar.gz");

    println!("[TTS] Downloading espeak-ng libs...");
    download_file_simple(ESPEAK_NG_LIBS_URL, &libs_tar)
        .await
        .map_err(|e| format!("Download espeak-ng libs: {e}"))?;
    println!("[TTS] Downloading espeak-ng data...");
    download_file_simple(ESPEAK_NG_DATA_URL, &data_tar)
        .await
        .map_err(|e| format!("Download espeak-ng data: {e}"))?;

    println!("[TTS] Extracting espeak-ng libs...");
    extract_tar_gz(&libs_tar, &dir).map_err(|e| format!("Extract espeak-ng libs: {e}"))?;
    println!("[TTS] Extracting espeak-ng data...");
    extract_tar_gz(&data_tar, &dir).map_err(|e| format!("Extract espeak-ng data: {e}"))?;

    // Clean up temp archives
    let _ = std::fs::remove_file(&libs_tar);
    let _ = std::fs::remove_file(&data_tar);

    // Verify the binary is now available
    let exe = espeak_path().ok_or("Cannot determine espeak-ng path after install")?;
    if !exe.exists() {
        // List directory contents for debugging
        println!("[TTS] espeak-ng dir contents:");
        if let Ok(entries) = std::fs::read_dir(&dir) {
            for entry in entries.flatten() {
                println!("  {:?}", entry.path());
            }
        }
        return Err(format!(
            "espeak-ng binary not found after extraction at {}",
            exe.display()
        ));
    }

    // Verify it works
    println!("[TTS] Testing espeak-ng...");
    let data_path = find_espeak_data_path().unwrap_or_else(|| espeak_dir().unwrap_or_default());
    let test = tokio::process::Command::new(&exe)
        .args(["-q", "--ipa=1", "-v", "en-us", "test"])
        .env("ESPEAK_DATA_PATH", &data_path)
        .output()
        .await
        .map_err(|e| format!("espeak-ng test failed: {e}"))?;
    if !test.status.success() {
        let stderr = String::from_utf8_lossy(&test.stderr);
        return Err(format!("espeak-ng test error: {stderr}"));
    }
    println!("[TTS] espeak-ng installed and working");

    Ok(())
}

#[cfg(not(target_os = "windows"))]
async fn ensure_espeak_ng() -> Result<(), String> {
    Ok(())
}

async fn download_file_simple(url: &str, dest: &PathBuf) -> Result<(), String> {
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Create dir: {e}"))?;
    }

    let client = reqwest::Client::builder()
        .user_agent("Starfield-app/0.1")
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Download failed: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }

    let bytes = resp.bytes().await.map_err(|e| format!("Read body: {e}"))?;
    std::fs::write(dest, bytes).map_err(|e| format!("Write file: {e}"))?;
    Ok(())
}

fn extract_tar_gz(path: &PathBuf, dest: &PathBuf) -> Result<(), String> {
    let file = std::fs::File::open(path).map_err(|e| format!("Open tar.gz: {e}"))?;
    let decoder = flate2::read::GzDecoder::new(file);
    let mut archive = tar::Archive::new(decoder);
    archive.unpack(dest).map_err(|e| format!("Unpack tar.gz: {e}"))?;
    Ok(())
}

// ── Download helpers ─────────────────────────────────────────────────────────

async fn download_file_with_progress(
    url: &str,
    dest: &PathBuf,
    channel: &Channel<TtsDownloadEvent>,
    base_percent: f32,
    percent_range: f32,
) -> Result<u64, String> {
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Create dir: {e}"))?;
    }

    let client = reqwest::Client::builder()
        .user_agent("Starfield-app/0.1")
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Download failed: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }

    let total = resp.content_length().unwrap_or(0);
    let mut downloaded: u64 = 0;
    let total_mb = total as f32 / 1_048_576.0;

    let mut file =
        std::fs::File::create(dest).map_err(|e| format!("Create file: {e}"))?;

    let mut stream = resp.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Stream error: {e}"))?;
        std::io::Write::write_all(&mut file, &chunk)
            .map_err(|e| format!("Write error: {e}"))?;
        downloaded += chunk.len() as u64;

        if total > 0 {
            let file_percent = downloaded as f32 / total as f32;
            let overall = base_percent + file_percent * percent_range;
            let downloaded_mb = downloaded as f32 / 1_048_576.0;
            let _ = channel.send(TtsDownloadEvent::Progress {
                percent: (overall * 100.0).min(100.0),
                downloaded_mb,
                total_mb,
            });
        }
    }

    Ok(downloaded)
}

// ── Tauri commands ───────────────────────────────────────────────────────────

#[command]
pub async fn check_tts_model() -> Result<bool, String> {
    let mp = model_path().ok_or("Cannot determine model path")?;
    if !mp.exists() {
        return Ok(false);
    }
    // Verify file isn't truncated (model.onnx should be ~326 MB)
    let meta = std::fs::metadata(&mp).map_err(|e| e.to_string())?;
    if meta.len() < 300_000_000 {
        println!("[TTS] Model file too small ({} bytes), re-download required", meta.len());
        let _ = std::fs::remove_file(&mp);
        return Ok(false);
    }
    let vp = voice_path("af_heart").ok_or("Cannot determine voice path")?;
    Ok(vp.exists())
}

#[command]
pub async fn download_tts_model(
    channel: Channel<TtsDownloadEvent>,
    state: tauri::State<'_ , TtsState>,
) -> Result<(), String> {
    let dir = tts_dir().ok_or("Cannot determine TTS directory")?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("Create dir: {e}"))?;
    let voices_dir = dir.join("voices");
    std::fs::create_dir_all(&voices_dir).map_err(|e| format!("Create voices dir: {e}"))?;

    // 1. Download config.json
    let cfg_dest = config_path().ok_or("Config path error")?;
    if !cfg_dest.exists() {
        download_file_with_progress(CONFIG_URL, &cfg_dest, &channel, 0.0, 0.01)
            .await
            .map_err(|e| format!("Config download: {e}"))?;
    }

    // 2. Download model (~326 MB fp32)
    // Remove old model variants to avoid confusion.
    // NOTE: do NOT delete model_optimized.onnx — it is the graph-optimized
    // version saved by ONNX Runtime on first load and makes subsequent
    // session creation ~10× faster.
    for old_name in ["model_quantized.onnx", "model_uint8.onnx"] {
        let old = dir.join(old_name);
        if old.exists() {
            let _ = std::fs::remove_file(&old);
        }
    }
    let mp = model_path().ok_or("Model path error")?;
    let model_was_missing = !mp.exists();
    if model_was_missing {
        download_file_with_progress(MODEL_URL, &mp, &channel, 0.01, 0.89)
            .await
            .map_err(|e| format!("Model download: {e}"))?;
    }

    // If we downloaded a new model, invalidate any cached ONNX session
    if model_was_missing {
        let mut guard = state.session.lock().await;
        *guard = None;
        state.load_count.store(0, Ordering::Relaxed);
        state.hit_count.store(0, Ordering::Relaxed);
        println!("[TTS] Cleared cached session after model download");
    }

    // 3. Download voice files (~524 KB each)
    let voice_count = VOICE_IDS.len() as f32;
    for (i, vid) in VOICE_IDS.iter().enumerate() {
        let vp = voice_path(vid).ok_or("Voice path error")?;
        if !vp.exists() {
            let url = format!("{VOICE_BASE_URL}/{vid}.bin");
            let base = 0.90 + (i as f32 / voice_count) * 0.09;
            download_file_with_progress(&url, &vp, &channel, base, 0.09 / voice_count)
                .await
                .map_err(|e| format!("Voice {vid} download: {e}"))?;
        }
    }

    // 4. Download espeak-ng on Windows if missing
    #[cfg(target_os = "windows")]
    {
        let _ = channel.send(TtsDownloadEvent::Progress {
            percent: 99.0,
            downloaded_mb: 0.0,
            total_mb: 0.0,
        });
        ensure_espeak_ng().await.map_err(|e| format!("espeak-ng install: {e}"))?;
    }

    let _ = channel.send(TtsDownloadEvent::Progress {
        percent: 100.0,
        downloaded_mb: 0.0,
        total_mb: 0.0,
    });
    let _ = channel.send(TtsDownloadEvent::Done);
    Ok(())
}

#[command]
pub async fn speak_tts(
    text: String,
    voice: String,
    speed: f32,
    state: tauri::State<'_, TtsState>,
) -> Result<Response, String> {
    let total_t0 = std::time::Instant::now();

    // Clamp speed to model-acceptable range
    let speed = speed.clamp(0.5, 2.0);

    // Auto-install espeak-ng on Windows if missing
    #[cfg(target_os = "windows")]
    ensure_espeak_ng().await.map_err(|e| format!("espeak-ng install: {e}"))?;

    // 1. Text → phonemes (async subprocess)
    let t0 = std::time::Instant::now();
    let phonemes = text_to_phonemes(&text).await?;
    println!("[TTS] Phoneme conversion took {:?}", t0.elapsed());
    if phonemes.is_empty() {
        return Err("No phonemes produced from input text".to_string());
    }

    // 2. Phonemes → token IDs
    let vocab = get_vocab(&state)?;
    let mut token_ids: Vec<i64> = phonemes
        .chars()
        .filter_map(|c| vocab.get(&c).copied())
        .collect();

    if token_ids.is_empty() {
        return Err(format!(
            "No token IDs produced from phonemes. Phonemes: {:?}",
            phonemes
        ));
    }

    if token_ids.len() > 510 {
        token_ids.truncate(510);
    }

    // 3. Pad with 0 at start/end
    token_ids.insert(0, 0);
    token_ids.push(0);
    let seq_len = token_ids.len();

    // 4. Load voice and select style vector (clone so guard can drop before await)
    let style_vec: Vec<f32> = {
        let voice_data = get_or_load_voice(&state, &voice)?;
        let style_idx = seq_len.min(510);
        let style_start = style_idx * 256;
        let style_end = style_start + 256;
        let voice_vec = voice_data.get(&voice).ok_or("Voice not loaded")?;
        if style_end > voice_vec.len() {
            return Err(format!(
                "Voice data too short for {} tokens (need index {})",
                seq_len, style_idx
            ));
        }
        voice_vec[style_start..style_end].to_vec()
    };

    // 5. Ensure ONNX session is loaded (cached after first call)
    ensure_session_loaded(&state).await?;

    // 6. Run inference in spawn_blocking so the Tokio async thread stays
    // responsive (user can cancel, UI events still process).
    let t0 = std::time::Instant::now();

    // Move session out of the mutex, run inference on a blocking thread,
    // then move it back. If anything panics or aborts, the next call will
    // simply reload the session.
    let mut session = {
        let mut guard = state.session.lock().await;
        guard.take().ok_or("Session not loaded")?
    };

    let token_ids_clone = token_ids.clone();
    let style_vec_clone = style_vec.clone();

    let result = tokio::task::spawn_blocking(move || {
        let wav = run_inference(
            &mut session,
            &token_ids_clone,
            seq_len,
            &style_vec_clone,
            speed,
        )?;
        Ok::<_, String>((session, wav))
    })
    .await
    .map_err(|e| format!("Inference spawn_blocking join: {e}"))?
    .map_err(|e| format!("Inference failed: {e}"))?;

    let (session, wav) = result;
    {
        let mut guard = state.session.lock().await;
        *guard = Some(session);
    }

    println!("[TTS] ONNX inference took {:?}", t0.elapsed());
    println!("[TTS] Total synthesis took {:?}", total_t0.elapsed());

    Ok(Response::new(wav))
}

/// Synchronous ONNX inference helper. No async/await, so no Send issues with guards.
fn run_inference(
    session: &mut Session,
    token_ids: &[i64],
    seq_len: usize,
    style_slice: &[f32],
    speed: f32,
) -> Result<Vec<u8>, String> {
    let input_ids_val = Tensor::from_array(([1usize, seq_len], token_ids.to_vec().into_boxed_slice()))
        .map_err(|e| format!("Tensor input_ids: {e}"))?;
    let style_val = Tensor::from_array(([1usize, 256usize], style_slice.to_vec().into_boxed_slice()))
        .map_err(|e| format!("Tensor style: {e}"))?;
    let speed_val = Tensor::from_array(([1usize], vec![speed].into_boxed_slice()))
        .map_err(|e| format!("Tensor speed: {e}"))?;

    let outputs = session
        .run(ort::inputs![
            "input_ids" => input_ids_val,
            "style" => style_val,
            "speed" => speed_val,
        ])
        .map_err(|e| format!("ONNX inference: {e}"))?;

    let audio_output = outputs[0].try_extract_tensor::<f32>()
        .map_err(|e| format!("Extract tensor: {e}"))?;
    let audio_samples: Vec<f32> = audio_output.1.iter().copied().collect();
    encode_wav(&audio_samples)
}

// ── Phoneme conversion ───────────────────────────────────────────────────────

fn is_pause_punct(ch: char) -> bool {
    matches!(ch, ',' | '.' | '!' | '?' | ';' | ':' | '\u{2014}' | '\u{2026}')
}

async fn run_espeak_raw(espeak: &std::path::PathBuf, text: &str) -> Result<String, String> {
    let mut cmd = tokio::process::Command::new(espeak);
    cmd.args(["-q", "--ipa", "-v", "en-us", text]);

    #[cfg(target_os = "windows")]
    if let Some(data_dir) = find_espeak_data_path() {
        cmd.env("ESPEAK_DATA_PATH", &data_dir);
    }

    let t0 = std::time::Instant::now();
    let output = cmd
        .output()
        .await
        .map_err(|e| format!("espeak-ng failed: {e}"))?;
    println!("[TTS] espeak-ng subprocess took {:?}", t0.elapsed());

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("espeak-ng error: {stderr}"));
    }

    let ipa = String::from_utf8_lossy(&output.stdout);
    // Replace newlines with spaces so multi-line espeak-ng output doesn't
    // concatenate words. Trim and normalise.
    Ok(ipa.trim().replace('\r', "").replace('\n', " "))
}

async fn text_to_phonemes(text: &str) -> Result<String, String> {
    let espeak = espeak_path().ok_or("Cannot determine espeak-ng path")?;

    // Scan the original text to record where each punctuation mark occurs
    // (how many words precede it). This lets us re-insert punctuation tokens
    // at the correct word boundaries in the IPA output.
    let mut punctuations: Vec<(usize, char)> = Vec::new();
    let mut word_count = 0;
    let mut in_word = false;

    for ch in text.chars() {
        if ch.is_whitespace() {
            in_word = false;
        } else if is_pause_punct(ch) {
            punctuations.push((word_count, ch));
            in_word = false;
        } else {
            if !in_word {
                word_count += 1;
                in_word = true;
            }
        }
    }

    // Replace pause punctuation with spaces so espeak-ng receives a clean
    // single-line string while preserving word boundaries (e.g. "hello—world"
    // stays two words instead of becoming "helloworld").
    let text_no_punct: String = text
        .chars()
        .map(|c| if is_pause_punct(c) { ' ' } else { c })
        .collect();
    let text_no_punct = text_no_punct.split_whitespace().collect::<Vec<_>>().join(" ");

    if text_no_punct.is_empty() {
        // Edge case: text is only punctuation — return tokens as-is.
        return Ok(punctuations.into_iter().map(|(_, c)| c).collect());
    }

    let ipa = run_espeak_raw(&espeak, &text_no_punct).await?;
    let ipa_words: Vec<&str> = ipa.split_whitespace().collect();

    // Reconstruct IPA with punctuation inserted as separate tokens surrounded
    // by spaces. The Kokoro vocab treats comma/period/etc. as distinct pause
    // tokens; they must be clearly separated from phoneme characters so the
    // model's learned token-to-audio alignment places the pause correctly.
    let mut result = String::new();
    let mut punct_idx = 0;

    // Leading punctuation (before the first word)
    while punct_idx < punctuations.len() && punctuations[punct_idx].0 == 0 {
        result.push(punctuations[punct_idx].1);
        punct_idx += 1;
    }
    if !result.is_empty() && word_count > 0 {
        result.push(' ');
    }

    if ipa_words.len() == word_count {
        // Exact match — insert punctuation at precise word boundaries
        for (i, word) in ipa_words.iter().enumerate() {
            if !result.is_empty() && !result.ends_with(' ') {
                result.push(' ');
            }
            result.push_str(word);
            while punct_idx < punctuations.len() && punctuations[punct_idx].0 == i + 1 {
                result.push(' ');
                result.push(punctuations[punct_idx].1);
                punct_idx += 1;
            }
        }
    } else {
        // espeak-ng expanded/contracted words (e.g. "100" → "one hundred").
        // Map punctuation to approximate positions using the word-count ratio
        // instead of dropping all pauses.
        let ratio = ipa_words.len() as f32 / word_count.max(1) as f32;
        println!(
            "[TTS] Word count mismatch (orig={} ipa={}), using approximate pause insertion (ratio={:.2})",
            word_count, ipa_words.len(), ratio
        );
        for (i, word) in ipa_words.iter().enumerate() {
            if !result.is_empty() && !result.ends_with(' ') {
                result.push(' ');
            }
            result.push_str(word);
            // Map this IPA word's position back to an approximate original position
            let orig_pos = ((i + 1) as f32 / ratio).round() as usize;
            while punct_idx < punctuations.len() && punctuations[punct_idx].0 <= orig_pos {
                result.push(' ');
                result.push(punctuations[punct_idx].1);
                punct_idx += 1;
            }
        }
    }

    // Append any trailing punctuation that wasn't inserted
    while punct_idx < punctuations.len() {
        result.push(' ');
        result.push(punctuations[punct_idx].1);
        punct_idx += 1;
    }

    Ok(result)
}

// ── Vocabulary ───────────────────────────────────────────────────────────────

fn get_vocab(state: &TtsState) -> Result<&HashMap<char, i64>, String> {
    state.vocab.get_or_try_init(|| {
        if let Some(cp) = config_path() {
            if cp.exists() {
                let data = std::fs::read_to_string(&cp)
                    .map_err(|e| format!("Read config: {e}"))?;
                let config: serde_json::Value =
                    serde_json::from_str(&data).map_err(|e| format!("Parse config: {e}"))?;
                if let Some(vocab_obj) = config.get("vocab").and_then(|v| v.as_object()) {
                    let mut map = HashMap::new();
                    for (key, val) in vocab_obj {
                        if let Some(ch) = key.chars().next() {
                            if let Some(id) = val.as_i64() {
                                map.insert(ch, id);
                            }
                        }
                    }
                    return Ok(map);
                }
            }
        }
        Ok(build_fallback_vocab())
    })
}

fn build_fallback_vocab() -> HashMap<char, i64> {
    let pairs = [
        ('$', 0), (';', 1), (':', 2), (',', 3), ('.', 4), ('!', 5), ('?', 6),
        ('\u{2014}', 9), ('\u{2026}', 10), ('"', 11), ('(', 12), (')', 13),
        ('\u{201c}', 14), ('\u{201d}', 15), (' ', 16), ('\u{0303}', 17),
        ('A', 24), ('I', 25), ('O', 31), ('Q', 33), ('S', 35), ('T', 36),
        ('W', 39), ('Y', 41), ('a', 43), ('b', 44), ('c', 45), ('d', 46),
        ('e', 47), ('f', 48), ('h', 50), ('i', 51), ('j', 52), ('k', 53),
        ('l', 54), ('m', 55), ('n', 56), ('o', 57), ('p', 58), ('q', 59),
        ('r', 60), ('s', 61), ('t', 62), ('u', 63), ('v', 64), ('w', 65),
        ('x', 66), ('y', 67), ('z', 68),
        ('\u{0251}', 69), ('\u{0250}', 70), ('\u{0252}', 71), ('\u{00e6}', 72),
        ('\u{03b2}', 75), ('\u{0254}', 76), ('\u{0255}', 77), ('\u{00e7}', 78),
        ('\u{0256}', 80), ('\u{00f0}', 81), ('\u{02a4}', 82), ('\u{0259}', 83),
        ('\u{025a}', 85), ('\u{025b}', 86), ('\u{025c}', 87), ('\u{025f}', 90),
        ('\u{0261}', 92), ('\u{0265}', 99), ('\u{0268}', 101), ('\u{026a}', 102),
        ('\u{0269}', 103), ('\u{026f}', 110), ('\u{0270}', 111), ('\u{014b}', 112),
        ('\u{0273}', 113), ('\u{0272}', 114), ('\u{0274}', 115), ('\u{00f8}', 116),
        ('\u{0278}', 118), ('\u{03b8}', 119), ('\u{0153}', 120), ('\u{0279}', 123),
        ('\u{027e}', 125), ('\u{027b}', 126), ('\u{0281}', 128), ('\u{027d}', 129),
        ('\u{0282}', 130), ('\u{0283}', 131), ('\u{0288}', 132), ('\u{02a7}', 133),
        ('\u{028a}', 135), ('\u{028b}', 136), ('\u{028c}', 138), ('\u{0263}', 139),
        ('\u{0264}', 140), ('\u{03c7}', 142), ('\u{028e}', 143), ('\u{0292}', 147),
        ('\u{0294}', 148), ('\u{02c8}', 156), ('\u{02cc}', 157), ('\u{02d0}', 158),
        ('\u{02b0}', 162), ('\u{02b2}', 164), ('\u{2193}', 169), ('\u{2192}', 171),
        ('\u{2197}', 172), ('\u{2198}', 173), ('\u{0275}', 177),
    ];
    pairs.iter().copied().collect()
}

// ── Voice loading ────────────────────────────────────────────────────────────

fn get_or_load_voice<'a>(
    state: &'a TtsState,
    voice_id: &str,
) -> Result<std::sync::RwLockReadGuard<'a, HashMap<String, Vec<f32>>>, String> {
    {
        let voices = state
            .voices
            .read()
            .map_err(|e| format!("Lock voices: {e}"))?;
        if voices.contains_key(voice_id) {
            return Ok(voices);
        }
    }

    let vp = voice_path(voice_id).ok_or("Voice path error")?;
    if !vp.exists() {
        return Err(format!(
            "Voice file not found: {}. Run download_tts_model first.",
            vp.display()
        ));
    }

    let raw = std::fs::read(&vp).map_err(|e| format!("Read voice: {e}"))?;
    if raw.len() % 4 != 0 {
        return Err("Voice file size not aligned to f32".to_string());
    }

    let samples: Vec<f32> = raw
        .chunks_exact(4)
        .map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]]))
        .collect();

    let mut voices = state
        .voices
        .write()
        .map_err(|e| format!("Lock voices write: {e}"))?;
    voices.insert(voice_id.to_string(), samples);
    drop(voices);

    let voices = state
        .voices
        .read()
        .map_err(|e| format!("Lock voices: {e}"))?;
    Ok(voices)
}

// ── ONNX session ─────────────────────────────────────────────────────────────

/// Ensure the ONNX session is loaded. Uses tokio::sync::Mutex so the lock is
/// async-safe and the guard is Send across await points.
async fn ensure_session_loaded(state: &TtsState) -> Result<(), String> {
    // Fast path: try lock and check without blocking
    {
        let guard = state.session.lock().await;
        if guard.is_some() {
            let hits = state.hit_count.fetch_add(1, Ordering::Relaxed) + 1;
            println!("[TTS] Session cache HIT (#{})", hits);
            return Ok(());
        }
    }

    let mp = model_path().ok_or("Model path error")?;
    if !mp.exists() {
        return Err(format!(
            "Model not found at {}. Run download_tts_model first.",
            mp.display()
        ));
    }

    // Clean up old quantized model to save disk space
    if let Some(dir) = tts_dir() {
        let old = dir.join("model_quantized.onnx");
        if old.exists() {
            let _ = std::fs::remove_file(&old);
        }
    }

    // Load the model in spawn_blocking to avoid blocking the Tokio worker thread
    let session = tokio::task::spawn_blocking(move || -> Result<Session, String> {
        // Use physical-core count for intra-op parallelism. On hyperthreaded CPUs
        // we divide logical threads by 2; cap at 8 to avoid oversubscription on
        // high-core-count workstations.
        let threads = (std::thread::available_parallelism()
            .map(|n| n.get())
            .unwrap_or(4)
            / 2)
            .clamp(2, 8);

        let opt_path = optimized_model_path();
        let use_optimized = opt_path.as_ref().map(|p| p.exists()).unwrap_or(false);

        println!(
            "[TTS] Loading ONNX model with {threads} threads (optimized={})...",
            use_optimized
        );
        let t0 = std::time::Instant::now();

        let cpu_ep = CPU::default().with_arena_allocator(true).build();

        let mut builder = Session::builder()
            .map_err(|e| format!("Session builder: {e}"))?
            .with_execution_providers([cpu_ep])
            .map_err(|e| format!("CPU EP: {e}"))?
            .with_intra_threads(threads)
            .map_err(|e| format!("Intra threads: {e}"))?
            .with_inter_threads(1)
            .map_err(|e| format!("Inter threads: {e}"))?
            .with_memory_pattern(true)
            .map_err(|e| format!("Memory pattern: {e}"))?
            .with_intra_op_spinning(true)
            .map_err(|e| format!("Intra spinning: {e}"))?
            .with_inter_op_spinning(true)
            .map_err(|e| format!("Inter spinning: {e}"))?
            .with_flush_to_zero()
            .map_err(|e| format!("Flush to zero: {e}"))?
            // Prepack weights into GEMM-optimal layout (one-time load cost,
            // faster every inference). Especially impactful on transformer
            // matmuls with AVX-512.
            .with_prepacking(true)
            .map_err(|e| format!("Prepacking: {e}"))?;

        let session = if use_optimized {
            builder = builder
                .with_optimization_level(GraphOptimizationLevel::Disable)
                .map_err(|e| format!("Optimization disable: {e}"))?;
            builder
                .commit_from_file(opt_path.unwrap())
                .map_err(|e| format!("Load optimized model: {e}"))?
        } else {
            builder = builder
                .with_optimization_level(GraphOptimizationLevel::All)
                .map_err(|e| format!("Optimization level: {e}"))?;
            if let Some(ref op) = opt_path {
                builder = builder
                    .with_optimized_model_path(op)
                    .map_err(|e| format!("Optimized model path: {e}"))?;
            }
            builder
                .commit_from_file(&mp)
                .map_err(|e| format!("Load model: {e}"))?
        };

        println!("[TTS] ONNX session loaded in {:?}", t0.elapsed());

        // Warm-up inference to pre-compile kernels and prime caches
        let warmup_t0 = std::time::Instant::now();
        let warmup_ids: Vec<i64> = vec![0, 24, 47, 47, 57, 16, 57, 57, 47, 56, 60, 0];
        let seq_len = warmup_ids.len();
        let dummy_style = vec![0.0f32; 256];
        let input_ids_val = Tensor::from_array(([1usize, seq_len], warmup_ids.into_boxed_slice()))
            .map_err(|e| format!("Warmup tensor: {e}"))?;
        let style_val = Tensor::from_array(([1usize, 256usize], dummy_style.into_boxed_slice()))
            .map_err(|e| format!("Warmup style: {e}"))?;
        let speed_val = Tensor::from_array(([1usize], vec![1.0f32].into_boxed_slice()))
            .map_err(|e| format!("Warmup speed: {e}"))?;
        let mut s = session;
        let _ = s.run(ort::inputs![
            "input_ids" => input_ids_val,
            "style" => style_val,
            "speed" => speed_val,
        ]).map_err(|e| format!("Warmup inference: {e}"))?;
        println!("[TTS] Warm-up inference took {:?}", warmup_t0.elapsed());
        Ok(s)
    })
    .await
    .map_err(|e| format!("spawn_blocking join: {e}"))??;

    // Store the loaded session — another task might have loaded while we were busy
    let mut guard = state.session.lock().await;
    if guard.is_none() {
        let loads = state.load_count.fetch_add(1, Ordering::Relaxed) + 1;
        println!("[TTS] Session cached for reuse (load #{})", loads);
        *guard = Some(session);
    } else {
        println!("[TTS] Session was already loaded by another task, discarding duplicate");
    }
    Ok(())
}

// ── WAV encoding ─────────────────────────────────────────────────────────────

fn encode_wav(samples: &[f32]) -> Result<Vec<u8>, String> {
    let spec = WavSpec {
        channels: 1,
        sample_rate: SAMPLE_RATE,
        bits_per_sample: 16,
        sample_format: SampleFormat::Int,
    };

    let mut cursor = Cursor::new(Vec::new());
    {
        let mut writer =
            WavWriter::new(&mut cursor, spec).map_err(|e| format!("WAV writer: {e}"))?;
        for &s in samples {
            let i16_sample = (s.clamp(-1.0, 1.0) * 32767.0) as i16;
            writer
                .write_sample(i16_sample)
                .map_err(|e| format!("WAV write: {e}"))?;
        }
        writer
            .finalize()
            .map_err(|e| format!("WAV finalize: {e}"))?;
    }

    Ok(cursor.into_inner())
}
