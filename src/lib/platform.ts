/**
 * Detect whether the current platform is macOS.
 *
 * Uses navigator.platform (deprecated but universally supported in WebView
 * contexts like Tauri). navigator.userAgentData is not yet available in all
 * Tauri WebView targets.
 */
const isMac =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform);

/** Human-readable modifier key label: "⌘" on macOS, "Ctrl+" elsewhere. */
export const modLabel = isMac ? "⌘" : "Ctrl+";

/** Human-readable modifier key alone (for Settings kbd display). */
export const modKey = isMac ? "⌘" : "Ctrl";
