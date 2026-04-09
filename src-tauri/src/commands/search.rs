use crate::commands::keychain::read_tavily_key;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use tauri::command;

const TAVILY_SEARCH_URL: &str = "https://api.tavily.com/search";

// ── Request / response types ──────────────────────────────────────────────

#[derive(Debug, Serialize)]
struct TavilyRequest {
    api_key: String,
    query: String,
    search_depth: String,
    max_results: u32,
    include_answer: bool,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct SearchResult {
    pub title: String,
    pub url: String,
    pub content: String,
    pub score: f32,
}

#[derive(Debug, Deserialize)]
struct TavilyResponse {
    #[serde(default)]
    results: Vec<SearchResult>,
}

// ── Tauri command ─────────────────────────────────────────────────────────

/// Run a Tavily web search and return the top results.
/// Called from the Luna page when web search is toggled on.
#[command]
pub async fn web_search(query: String) -> Result<Vec<SearchResult>, String> {
    let api_key = match read_tavily_key()? {
        Some(k) => k,
        None => {
            return Err(
                "No Tavily API key found. Please add one in Settings.".to_string(),
            );
        }
    };

    let body = TavilyRequest {
        api_key,
        query,
        search_depth: "advanced".to_string(),
        max_results: 6,
        include_answer: false,
    };

    let client = Client::new();
    let response = client
        .post(TAVILY_SEARCH_URL)
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("Tavily API error {status}: {text}"));
    }

    let payload: TavilyResponse = response.json().await.map_err(|e| e.to_string())?;
    Ok(payload.results)
}
