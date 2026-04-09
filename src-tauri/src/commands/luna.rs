use crate::commands::keychain::read_deepseek_key;
use futures_util::StreamExt;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use tauri::{command, ipc::Channel};

const DEEPSEEK_BASE_URL: &str = "https://api.deepseek.com";
const DEEPSEEK_MODEL: &str = "deepseek-chat";

// ── Request / response types ──────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Serialize)]
struct DeepSeekRequest {
    model: String,
    messages: Vec<DeepSeekMessage>,
    thinking: ThinkingConfig,
    stream: bool,
    temperature: f32,
    max_tokens: u32,
}

#[derive(Debug, Serialize)]
struct ThinkingConfig {
    #[serde(rename = "type")]
    mode: &'static str,
}

/// A single message in the DeepSeek API format.
/// The system message is always first so DeepSeek can cache it as a prefix.
#[derive(Debug, Serialize)]
struct DeepSeekMessage {
    role: String,
    content: String,
}

/// Payload emitted through the IPC channel for each streaming chunk.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum StreamEvent {
    #[serde(rename = "chunk")]
    Chunk { text: String },
    #[serde(rename = "done")]
    Done,
    #[serde(rename = "error")]
    Error { message: String },
}

// ── Tauri command ─────────────────────────────────────────────────────────

/// Stream a Luna response from DeepSeek.
///
/// The system prompt is passed in from the frontend so it is always in sync
/// with the latest personality definition in `luna-prompt.ts`.
///
/// DeepSeek automatically caches prompt prefixes that are ≥ 1 024 tokens,
/// so sending the full system prompt + conversation history on every request
/// is both correct and cost-efficient — the cached portion is billed at the
/// cache hit rate.
#[command]
pub async fn stream_luna(
    system_prompt: String,
    history: Vec<ChatMessage>,
    user_message: String,
    channel: Channel<StreamEvent>,
) -> Result<(), String> {
    let api_key = match read_deepseek_key()? {
        Some(k) => k,
        None => {
            let _ = channel.send(StreamEvent::Error {
                message: "No DeepSeek API key found. Please add one in Settings.".to_string(),
            });
            return Ok(());
        }
    };

    // Build message list: system first (cache anchor), then history, then user
    let mut messages: Vec<DeepSeekMessage> = Vec::new();

    messages.push(DeepSeekMessage {
        role: "system".to_string(),
        content: system_prompt,
    });

    for msg in &history {
        messages.push(DeepSeekMessage {
            role: if msg.role == "user" { "user" } else { "assistant" }.to_string(),
            content: msg.content.clone(),
        });
    }

    messages.push(DeepSeekMessage {
        role: "user".to_string(),
        content: user_message,
    });

    let body = DeepSeekRequest {
        model: DEEPSEEK_MODEL.to_string(),
        messages,
        thinking: ThinkingConfig { mode: "disabled" },
        stream: true,
        temperature: 0.7,
        max_tokens: 8192,
    };

    let url = format!("{}/chat/completions", DEEPSEEK_BASE_URL);

    let client = Client::new();
    let response = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        let _ = channel.send(StreamEvent::Error {
            message: format!("DeepSeek API error {status}: {text}"),
        });
        return Ok(());
    }

    let mut stream = response.bytes_stream();

    while let Some(chunk) = stream.next().await {
        let bytes = match chunk {
            Ok(b) => b,
            Err(e) => {
                let _ = channel.send(StreamEvent::Error {
                    message: e.to_string(),
                });
                return Ok(());
            }
        };

        let text = String::from_utf8_lossy(&bytes);

        for line in text.lines() {
            let Some(json_str) = line.strip_prefix("data: ") else {
                continue;
            };

            if json_str.trim() == "[DONE]" {
                let _ = channel.send(StreamEvent::Done);
                return Ok(());
            }

            if let Ok(val) = serde_json::from_str::<serde_json::Value>(json_str) {
                if let Some(delta_text) = val
                    .pointer("/choices/0/delta/content")
                    .and_then(|v| v.as_str())
                {
                    if !delta_text.is_empty() {
                        let _ = channel.send(StreamEvent::Chunk {
                            text: delta_text.to_string(),
                        });
                    }
                }

                // Check for finish reason
                if val
                    .pointer("/choices/0/finish_reason")
                    .and_then(|v| v.as_str())
                    .map(|r| r == "stop" || r == "length")
                    .unwrap_or(false)
                {
                    let _ = channel.send(StreamEvent::Done);
                    return Ok(());
                }
            }
        }
    }

    let _ = channel.send(StreamEvent::Done);
    Ok(())
}
