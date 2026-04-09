import { invoke, Channel } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { buildLunaSystemPrompt } from "./luna-prompt";

/** Returns the live Tauri window handle. */
export const win = () => getCurrentWindow();

// ── Keychain ──────────────────────────────────────────────────────────────

export const saveDeepSeekKey = (key: string) =>
  invoke<void>("save_deepseek_key", { key });

export const getDeepSeekKey = () => invoke<string | null>("get_deepseek_key");

export const deleteDeepSeekKey = () => invoke<void>("delete_deepseek_key");

export const saveTavilyKey = (key: string) =>
  invoke<void>("save_tavily_key", { key });

export const getTavilyKey = () => invoke<string | null>("get_tavily_key");

export const deleteTavilyKey = () => invoke<void>("delete_tavily_key");

// ── Streaming chat (Luna / DeepSeek) ─────────────────────────────────────

export interface ChatMessagePayload {
  role: "user" | "assistant";
  content: string;
}

export type StreamEvent =
  | { type: "chunk"; text: string }
  | { type: "done" }
  | { type: "error"; message: string };

/**
 * Stream a Luna response from the Rust backend.
 * The system prompt is injected here so it is always current and consistent.
 */
export const streamLuna = (
  userMessage: string,
  history: ChatMessagePayload[],
  searchContext: string,
  onEvent: (e: StreamEvent) => void,
) => {
  const systemPrompt = buildLunaSystemPrompt();
  const channel = new Channel<StreamEvent>();
  channel.onmessage = onEvent;

  // Prepend search context to the user message if provided
  const userContent = searchContext
    ? `${searchContext}${userMessage}`
    : userMessage;

  return invoke<void>("stream_luna", {
    systemPrompt,
    history,
    userMessage: userContent,
    channel,
  });
};

// ── Web search (Tavily) ───────────────────────────────────────────────────

export interface SearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

export const webSearch = (query: string) =>
  invoke<SearchResult[]>("web_search", { query });

// ── Window controls ───────────────────────────────────────────────────────

export const minimizeWindow = () => win().minimize();
export const maximizeWindow = () => win().toggleMaximize();
export const closeWindow = () => win().close();
