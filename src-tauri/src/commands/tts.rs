use base64::{engine::general_purpose::STANDARD as B64, Engine};
use futures_util::StreamExt;
use hound::{SampleFormat, WavSpec, WavWriter};
use once_cell::sync::OnceCell;
use ort::session::Session;
use ort::value::Tensor;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::Cursor;
use std::path::PathBuf;
use std::sync::RwLock;
use tauri::{command, ipc::Channel};

// ── espeak-ng auto-install URLs (thewh1teagle/espeakng-loader) ─────────────

#[cfg(target_os = "windows")]
const ESPEAK_NG_LIBS_URL: &str = "https://github.com/thewh1teagle/espeakng-loader/releases/download/v0.1.0/espeak-ng-libs-windows-x86_64.tar.gz";
#[cfg(target_os = "windows")]
const ESPEAK_NG_DATA_URL: &str = "https://github.com/thewh1teagle/espeakng-loader/releases/download/v0.1.0/espeak-ng-data.tar.gz";

// ── Model URLs ───────────────────────────────────────────────────────────────

const MODEL_URL: &str = "https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/onnx/model_quantized.onnx";
const VOICE_BASE_URL: &str =
    "https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/voices";
const CONFIG_URL: &str = "https://huggingface.co/hexgrad/Kokoro-82M/resolve/main/config.json";

const MODEL_FILENAME: &str = "model_quantized.onnx";
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
    session: std::sync::Mutex<Option<Session>>,
    voices: RwLock<HashMap<String, Vec<f32>>>,
    vocab: OnceCell<HashMap<char, i64>>,
}

impl TtsState {
    pub fn new() -> Self {
        Self {
            session: std::sync::Mutex::new(None),
            voices: RwLock::new(HashMap::new()),
            vocab: OnceCell::new(),
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
async fn ensure_espeak_ng() -> Result<(), String> {
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
    let vp = voice_path("af_heart").ok_or("Cannot determine voice path")?;
    Ok(vp.exists())
}

#[command]
pub async fn download_tts_model(
    channel: Channel<TtsDownloadEvent>,
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

    // 2. Download model (~86 MB)
    let mp = model_path().ok_or("Model path error")?;
    if !mp.exists() {
        download_file_with_progress(MODEL_URL, &mp, &channel, 0.01, 0.89)
            .await
            .map_err(|e| format!("Model download: {e}"))?;
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
) -> Result<String, String> {
    // Clamp speed to model-acceptable range
    let speed = speed.clamp(0.5, 2.0);

    // Auto-install espeak-ng on Windows if missing
    #[cfg(target_os = "windows")]
    ensure_espeak_ng().await.map_err(|e| format!("espeak-ng install: {e}"))?;

    // 1. Text → phonemes (async subprocess)
    let phonemes = text_to_phonemes(&text).await?;
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

    // 4. Load ONNX session (cached after first call)
    let mut session_guard = get_or_load_session(&state)?;
    let session = session_guard.as_mut().ok_or("Session not loaded")?;

    // 5. Load voice and select style vector
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
    let style_slice = &voice_vec[style_start..style_end];

    // 6. Prepare tensors — use Tensor::from_array for ort v2 compatibility
    let input_ids_val = Tensor::from_array(([1usize, seq_len], token_ids.into_boxed_slice()))
        .map_err(|e| format!("Tensor input_ids: {e}"))?;
    let style_val = Tensor::from_array(([1usize, 256usize], style_slice.to_vec().into_boxed_slice()))
        .map_err(|e| format!("Tensor style: {e}"))?;
    let speed_val = Tensor::from_array(([1usize], vec![speed].into_boxed_slice()))
        .map_err(|e| format!("Tensor speed: {e}"))?;

    // 7. Run inference
    let outputs = session
        .run(ort::inputs![
            "input_ids" => input_ids_val,
            "style" => style_val,
            "speed" => speed_val,
        ])
        .map_err(|e| format!("ONNX inference: {e}"))?;

    // 8. Extract audio samples
    let audio_output = outputs[0].try_extract_tensor::<f32>()
        .map_err(|e| format!("Extract tensor: {e}"))?;
    let audio_samples: Vec<f32> = audio_output.1.iter().copied().collect();

    // 9. Encode as WAV
    let wav_bytes = encode_wav(&audio_samples)?;

    // 10. Base64
    Ok(B64.encode(&wav_bytes))
}

// ── Phoneme conversion ───────────────────────────────────────────────────────

async fn text_to_phonemes(text: &str) -> Result<String, String> {
    let espeak = espeak_path().ok_or("Cannot determine espeak-ng path")?;

    let mut cmd = tokio::process::Command::new(&espeak);
    // Use --ipa without --no-wrap (Windows build doesn't support --no-wrap)
    cmd.args(["-q", "--ipa", "-v", "en-us", text]);

    #[cfg(target_os = "windows")]
    if let Some(data_dir) = find_espeak_data_path() {
        cmd.env("ESPEAK_DATA_PATH", &data_dir);
    }

    let output = cmd
        .output()
        .await
        .map_err(|e| format!("espeak-ng failed: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("espeak-ng error: {stderr}"));
    }

    let ipa = String::from_utf8_lossy(&output.stdout);
    let cleaned = ipa.trim().replace('\r', "").replace('\n', "");
    Ok(cleaned)
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

fn get_or_load_session(state: &TtsState) -> Result<std::sync::MutexGuard<'_, Option<Session>>, String> {
    let mut guard = state
        .session
        .lock()
        .map_err(|e| format!("Lock session: {e}"))?;

    if guard.is_some() {
        return Ok(guard);
    }

    let mp = model_path().ok_or("Model path error")?;
    if !mp.exists() {
        return Err(format!(
            "Model not found at {}. Run download_tts_model first.",
            mp.display()
        ));
    }

    println!("[TTS] Loading ONNX model from disk (one-time)...");
    let session = Session::builder()
        .map_err(|e| format!("Session builder: {e}"))?
        .commit_from_file(&mp)
        .map_err(|e| format!("Load model: {e}"))?;
    println!("[TTS] ONNX model loaded and cached");

    *guard = Some(session);
    Ok(guard)
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
