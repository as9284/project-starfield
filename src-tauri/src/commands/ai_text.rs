use crate::commands::keychain::read_deepseek_key;
use serde::{Deserialize, Serialize};
use tauri::command;

const DEEPSEEK_BASE_URL: &str = "https://api.deepseek.com";
const DEEPSEEK_MODEL: &str = "deepseek-chat";

#[derive(Debug, Serialize)]
struct AiTextRequest {
    model: String,
    messages: Vec<AiTextMessage>,
    stream: bool,
    temperature: f32,
    max_tokens: u32,
}

#[derive(Debug, Serialize)]
struct AiTextMessage {
    role: String,
    content: String,
}

#[derive(Debug, Deserialize)]
struct AiTextResponse {
    choices: Vec<AiTextChoice>,
}

#[derive(Debug, Deserialize)]
struct AiTextChoice {
    message: AiTextChoiceMessage,
}

#[derive(Debug, Deserialize)]
struct AiTextChoiceMessage {
    content: Option<String>,
}

/// Non-streaming DeepSeek text generation.
/// Used by Writing Assistant and Meeting Mode for one-shot AI calls.
#[command]
pub async fn ai_text(prompt: String, max_tokens: u32) -> Result<String, String> {
    let api_key = read_deepseek_key()?
        .ok_or_else(|| "No DeepSeek API key found. Please add one in Settings.".to_string())?;

    let body = AiTextRequest {
        model: DEEPSEEK_MODEL.to_string(),
        messages: vec![AiTextMessage {
            role: "user".to_string(),
            content: prompt,
        }],
        stream: false,
        temperature: 0.7,
        max_tokens,
    };

    let url = format!("{}/chat/completions", DEEPSEEK_BASE_URL);

    let client = reqwest::Client::new();
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
        return Err(format!("DeepSeek API error {status}: {text}"));
    }

    let parsed: AiTextResponse = response.json().await.map_err(|e| e.to_string())?;

    parsed
        .choices
        .first()
        .and_then(|c| c.message.content.clone())
        .ok_or_else(|| "No response from DeepSeek".to_string())
}
