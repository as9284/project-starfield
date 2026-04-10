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

export const saveWeatherKey = (key: string) =>
  invoke<void>("save_weather_key", { key });

export const getWeatherKey = () => invoke<string | null>("get_weather_key");

export const deleteWeatherKey = () => invoke<void>("delete_weather_key");

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
 *
 * The system prompt is built here using the constellation handler registry,
 * so it always includes up-to-date command instructions and live state from
 * every registered constellation — no manual wiring needed.
 */
export const streamLuna = (
  userMessage: string,
  history: ChatMessagePayload[],
  searchContext: string,
  onEvent: (e: StreamEvent) => void,
  memories?: string[],
) => {
  const systemPrompt = buildLunaSystemPrompt(memories);
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

/**
 * Lower-level stream chat that accepts a custom system prompt.
 * Used by Beacon (and potentially other constellations) that need
 * their own persona / context instead of Luna's default prompt.
 *
 * @param systemPrompt - The full system prompt including persona and context
 * @param history - Previous conversation messages for context
 * @param userMessage - The current user message to respond to
 * @param onEvent - Callback receiving streaming chunks, done, or error events
 */
export const streamChat = (
  systemPrompt: string,
  history: ChatMessagePayload[],
  userMessage: string,
  onEvent: (e: StreamEvent) => void,
) => {
  const channel = new Channel<StreamEvent>();
  channel.onmessage = onEvent;
  return invoke<void>("stream_luna", {
    systemPrompt,
    history,
    userMessage,
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

// ── Beacon: local directory scanning ──────────────────────────────────────

export interface ScanResult {
  name: string;
  root: string;
  fileCount: number;
  files: {
    path: string;
    relativePath: string;
    size: number;
    isText: boolean;
    content?: string;
  }[];
}

export const scanLocalDirectory = (path: string) =>
  invoke<ScanResult>("scan_local_directory", { path });

// ── Pulsar: yt-dlp media downloads ───────────────────────────────────────

export type PulsarEvent =
  | { type: "progress"; percent: number; speed: string; eta: string }
  | { type: "playlistItem"; index: number; total: number; title: string }
  | { type: "merging" }
  | { type: "done"; file_path: string | null }
  | { type: "error"; message: string };

export const pulsarCheckYtdlp = () => invoke<boolean>("pulsar_check_ytdlp");

export const pulsarGetDownloadsDir = () =>
  invoke<string>("pulsar_get_downloads_dir");

export const pulsarInstallYtdlp = () => invoke<boolean>("pulsar_install_ytdlp");

export const pulsarDownload = (
  downloadId: string,
  url: string,
  formatArg: string,
  audioFormat: string,
  outputDir: string,
  playlist: boolean,
  onEvent: (e: PulsarEvent) => void,
) => {
  const channel = new Channel<PulsarEvent>();
  channel.onmessage = onEvent;
  return invoke<void>("pulsar_download", {
    downloadId,
    url,
    formatArg,
    audioFormat,
    outputDir,
    playlist,
    channel,
  });
};

export const pulsarCancelDownload = (downloadId: string) =>
  invoke<void>("pulsar_cancel_download", { downloadId });

export const pulsarDeleteFile = (filePath: string) =>
  invoke<void>("pulsar_delete_file", { filePath });
