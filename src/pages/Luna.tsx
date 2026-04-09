import { useState, useRef, useEffect } from "react";
import { Send, Trash2, Globe, Sparkles } from "lucide-react";
import TextareaAutosize from "react-textarea-autosize";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import StarField from "../components/StarField";
import { useAppStore } from "../store/useAppStore";
import { streamLuna, webSearch } from "../lib/tauri";

export default function Luna() {
  const {
    messages,
    addMessage,
    updateLastAssistantMessage,
    clearMessages,
    isStreaming,
    setIsStreaming,
    hasDeepSeekKey,
    hasTavilyKey,
    setView,
  } = useAppStore();

  const [input, setInput] = useState("");
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isStreaming || !hasDeepSeekKey) return;

    setInput("");
    addMessage({ id: crypto.randomUUID(), role: "user", content: text, timestamp: Date.now() });

    setIsStreaming(true);
    addMessage({ id: crypto.randomUUID(), role: "assistant", content: "", timestamp: Date.now() });

    try {
      // Optionally run a web search first
      let searchContext = "";
      if (webSearchEnabled && hasTavilyKey) {
        try {
          const results = await webSearch(text);
          if (results.length > 0) {
            searchContext =
              "\n\n[Web search results]\n" +
              results
                .slice(0, 5)
                .map((r, i) => `${i + 1}. **${r.title}** (${r.url})\n${r.content}`)
                .join("\n\n") +
              "\n[End of web search results]\n\n";
          }
        } catch {
          // silently skip search errors
        }
      }

      const historyMessages = messages
        .filter((m) => m.content.length > 0)
        .slice(-20)
        .map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.content }));

      let accumulated = "";
      await streamLuna(
        text,
        historyMessages,
        searchContext,
        (event) => {
          if (event.type === "chunk") {
            accumulated += event.text;
            updateLastAssistantMessage(accumulated);
          }
        },
      );
    } catch (e) {
      updateLastAssistantMessage(`Error: ${String(e)}`);
    } finally {
      setIsStreaming(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 relative overflow-hidden">
      <StarField />

      <div className="above-stars flex-1 flex flex-col min-h-0">
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3"
          style={{ borderBottom: "1px solid var(--color-border-dim)" }}
        >
          <div className="flex items-center gap-2">
            <Sparkles size={16} style={{ color: "var(--color-purple-400)" }} />
            <span className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
              Luna
            </span>
            <span className="status-dot ml-1" />
          </div>

          {messages.length > 0 && (
            <button
              onClick={clearMessages}
              className="win-btn"
              title="Clear conversation"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4 min-h-0">
          {messages.length === 0 && (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
              <Sparkles
                size={40}
                style={{ color: "var(--color-purple-500)", opacity: 0.6 }}
              />
              <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                {hasDeepSeekKey
                  ? "Ask Luna anything…"
                  : "Add a DeepSeek API key in Settings to start."}
              </p>
              {!hasDeepSeekKey && (
                <button
                  className="text-xs underline"
                  style={{ color: "var(--color-purple-400)", background: "none", border: "none", cursor: "pointer" }}
                  onClick={() => setView("settings")}
                >
                  Open Settings
                </button>
              )}
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={msg.id}
              className={`animate-fade-up flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] px-4 py-3 text-sm ${
                  msg.role === "user" ? "msg-user" : "msg-assistant"
                }`}
              >
                {msg.role === "assistant" && !msg.content && i === messages.length - 1 && isStreaming ? (
                  <div className="flex gap-1 items-center h-4">
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                  </div>
                ) : msg.role === "assistant" ? (
                  <div className="prose-starfield">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <span style={{ color: "var(--color-text-primary)" }}>{msg.content}</span>
                )}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Input bar */}
        <div
          className="px-4 py-3 flex flex-col gap-2"
          style={{ borderTop: "1px solid var(--color-border-dim)", background: "rgba(8,8,26,0.7)" }}
        >
          {/* Toolbar */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => hasTavilyKey && setWebSearchEnabled((v) => !v)}
              title={hasTavilyKey ? "Toggle web search" : "Add Tavily key in Settings"}
              className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-md transition-colors"
              style={{
                color: webSearchEnabled && hasTavilyKey ? "var(--color-purple-400)" : "var(--color-text-muted)",
                background: webSearchEnabled && hasTavilyKey ? "rgba(124,79,240,0.12)" : "transparent",
                border: "1px solid",
                borderColor: webSearchEnabled && hasTavilyKey ? "rgba(124,79,240,0.3)" : "var(--color-border-dim)",
                cursor: hasTavilyKey ? "pointer" : "not-allowed",
                opacity: hasTavilyKey ? 1 : 0.5,
              }}
            >
              <Globe size={12} />
              Web search
            </button>
          </div>

          {/* Input row */}
          <div className="flex gap-2 items-end">
            <TextareaAutosize
              className="chat-input flex-1"
              placeholder="Message Luna…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              minRows={1}
              maxRows={6}
              disabled={isStreaming || !hasDeepSeekKey}
            />
            <button
              className="btn-send"
              onClick={() => void handleSend()}
              disabled={!input.trim() || isStreaming || !hasDeepSeekKey}
              title="Send"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
