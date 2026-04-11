import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Trash2,
  Globe,
  ArrowUp,
  PanelLeftOpen,
  PanelLeftClose,
  Plus,
  MessageSquare,
  X,
  Sparkles,
  RotateCcw,
  Pencil,
  Check,
} from "lucide-react";
import TextareaAutosize from "react-textarea-autosize";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AiGlobe } from "../components/AiGlobe";
import { StarParticles } from "../components/StarParticles";
import {
  useAppStore,
  MAX_CONVERSATION_TITLE_LENGTH,
  type AppView,
} from "../store/useAppStore";
import { usePulsarStore } from "../store/usePulsarStore";
import { streamLuna, webSearch, pulsarGetDownloadsDir } from "../lib/tauri";
import type { ChatMessagePayload } from "../lib/tauri";
import { extractMemories } from "../lib/memory";
import { modLabel } from "../lib/platform";
import type { ActionResult } from "../lib/constellation-registry";
import {
  parseCommands,
  stripCommandBlocks,
  hasCommandBlocks,
} from "../lib/constellation-registry";
import {
  constellationHandlers,
  inferNavigationTarget,
} from "../lib/constellations";

type ControlledView = Exclude<AppView, "luna" | "settings">;

// ── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}

// ── Main component ───────────────────────────────────────────────────────────

export default function Luna() {
  const {
    conversations,
    activeConversationId,
    createConversation,
    switchConversation,
    deleteConversation,
    renameConversation,
    addMessage,
    updateLastAssistantMessage,
    clearMessages,
    removeLastAssistantMessage,
    removeFromLastUserMessage,
    memories,
    addMemory,
    isStreaming,
    setIsStreaming,
    hasDeepSeekKey,
    hasTavilyKey,
    setView,
    toggleConstellations,
    showConstellations,
  } = useAppStore();

  const { outputDir, setOutputDir } = usePulsarStore();

  const activeConvo = conversations.find((c) => c.id === activeConversationId);
  const messages = activeConvo?.messages ?? [];

  const [input, setInput] = useState("");
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [confirmDeleteConvId, setConfirmDeleteConvId] = useState<string | null>(
    null,
  );
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
  const [actionResults, setActionResults] = useState<
    Record<string, ActionResult[]>
  >({});
  const [pendingActions, setPendingActions] = useState<Set<string>>(new Set());
  const bottomRef = useRef<HTMLDivElement>(null);

  const sortedConversations = useMemo(
    () => [...conversations].sort((a, b) => b.updatedAt - a.updatedAt),
    [conversations],
  );

  const memoryStrings = useMemo(
    () => memories.map((m) => m.content),
    [memories],
  );

  // Ensure output dir is set for Pulsar downloads initiated from Luna
  useEffect(() => {
    if (!outputDir) {
      pulsarGetDownloadsDir()
        .then(setOutputDir)
        .catch(() => {});
    }
  }, [outputDir, setOutputDir]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, actionResults]);

  // ── Constellation command executor (registry-driven) ───────────────────
  const executeCommands = useCallback(
    async (
      messageId: string,
      response: string,
      fallbackView: ControlledView | null,
    ) => {
      const results: ActionResult[] = [];

      for (const handler of constellationHandlers) {
        const commands = parseCommands(
          response,
          handler.tag,
          handler.multiCommand,
        );
        if (commands.length > 0) {
          const handlerResults = await handler.execute(commands);
          results.push(...handlerResults);
        }
      }

      // Fallback navigation when user intent was detected but no
      // navigate-commands block was emitted by the model.
      if (
        fallbackView &&
        !results.some((r) => r.type === "navigated")
      ) {
        results.push({
          type: "navigated",
          handler: "navigate-commands",
          to: fallbackView,
        });
        setView(fallbackView);
      }

      if (results.length > 0) {
        setActionResults((prev) => ({
          ...prev,
          [messageId]: [...(prev[messageId] ?? []), ...results],
        }));
      }

      setPendingActions((prev) => {
        const s = new Set(prev);
        s.delete(messageId);
        return s;
      });
    },
    [setView],
  );

  // ── Core send logic ───────────────────────────────────────────────────────
  const runStream = useCallback(
    async (
      text: string,
      historyMessages: ChatMessagePayload[],
      assistantMsgId: string,
      isFirstMessage: boolean,
      fallbackView: ControlledView | null,
    ) => {
      let accumulated = "";
      try {
        let searchContext = "";
        if (webSearchEnabled && hasTavilyKey) {
          try {
            const results = await webSearch(text);
            if (results.length > 0) {
              searchContext =
                "\n\n[Web search results]\n" +
                results
                  .slice(0, 5)
                  .map(
                    (r, i) =>
                      `${i + 1}. **${r.title}** (${r.url})\n${r.content}`,
                  )
                  .join("\n\n") +
                "\n[End of web search results]\n\n";
            }
          } catch {
            /* skip */
          }
        }

        await streamLuna(
          text,
          historyMessages,
          searchContext,
          (event) => {
            if (event.type === "chunk") {
              accumulated += event.text;
              updateLastAssistantMessage(
                stripCommandBlocks(accumulated, constellationHandlers),
              );
            }
          },
          memoryStrings,
        );

        // Store clean content as final message
        updateLastAssistantMessage(
          stripCommandBlocks(accumulated, constellationHandlers),
        );

        if (isFirstMessage && activeConversationId) {
          renameConversation(
            activeConversationId,
            text.slice(0, MAX_CONVERSATION_TITLE_LENGTH),
          );
        }

        const extracted = extractMemories(text, accumulated);
        for (const mem of extracted) addMemory(mem);
      } catch (e) {
        updateLastAssistantMessage(`Error: ${String(e)}`);
      } finally {
        setIsStreaming(false);
        const shouldExecute =
          hasCommandBlocks(accumulated, constellationHandlers) ||
          fallbackView !== null;
        if (shouldExecute) {
          setPendingActions((prev) => new Set([...prev, assistantMsgId]));
          void executeCommands(assistantMsgId, accumulated, fallbackView);
        }
      }
    },
    [
      webSearchEnabled,
      hasTavilyKey,
      memoryStrings,
      updateLastAssistantMessage,
      activeConversationId,
      renameConversation,
      addMemory,
      setIsStreaming,
      executeCommands,
    ],
  );

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isStreaming || !hasDeepSeekKey) return;
    if (!activeConversationId) createConversation();
    setInput("");
    const isFirstMessage = messages.length === 0;
    const fallbackView = inferNavigationTarget(text);
    addMessage({
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      timestamp: Date.now(),
    });
    setIsStreaming(true);
    const assistantMsgId = crypto.randomUUID();
    addMessage({
      id: assistantMsgId,
      role: "assistant",
      content: "",
      timestamp: Date.now(),
    });
    const historyMessages = messages
      .filter((m) => m.content.length > 0)
      .slice(-20)
      .map((m) => ({ role: m.role, content: m.content }));
    await runStream(
      text,
      historyMessages,
      assistantMsgId,
      isFirstMessage,
      fallbackView,
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const handleRetry = async () => {
    if (isStreaming) return;
    let lastUserIndex = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        lastUserIndex = i;
        break;
      }
    }
    if (lastUserIndex === -1) return;
    const lastUser = messages[lastUserIndex];
    const fallbackView = inferNavigationTarget(lastUser.content);
    removeLastAssistantMessage();
    setIsStreaming(true);
    const assistantMsgId = crypto.randomUUID();
    addMessage({
      id: assistantMsgId,
      role: "assistant",
      content: "",
      timestamp: Date.now(),
    });
    const historyMessages = messages
      .slice(0, lastUserIndex)
      .filter((m) => m.content.length > 0)
      .slice(-20)
      .map((m) => ({ role: m.role, content: m.content }));
    await runStream(
      lastUser.content,
      historyMessages,
      assistantMsgId,
      false,
      fallbackView,
    );
  };

  const handleEdit = () => {
    if (isStreaming) return;
    const content = removeFromLastUserMessage();
    if (content) setInput(content);
  };

  const isEmpty = messages.length === 0;
  const lastAssistantId = [...messages]
    .reverse()
    .find((m) => m.role === "assistant")?.id;
  const lastUserId = [...messages].reverse().find((m) => m.role === "user")?.id;

  return (
    <div className="luna-shell">
      {/* Ambient star particles */}
      <StarParticles />

      {/* Sidebar */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            className="luna-sidebar"
            initial={{ opacity: 0, marginLeft: -250 }}
            animate={{ opacity: 1, marginLeft: 0 }}
            exit={{ opacity: 0, marginLeft: -250 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            <div className="luna-sidebar-header">
              <motion.button
                className="luna-sidebar-new"
                onClick={() => createConversation()}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
              >
                <Plus size={14} />
                <span>New Conversation</span>
              </motion.button>
              <motion.button
                className="luna-tool-btn"
                onClick={() => setSidebarOpen(false)}
                title="Close sidebar"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
              >
                <PanelLeftClose size={15} />
              </motion.button>
            </div>
            <div className="luna-sidebar-list">
              <AnimatePresence>
                {sortedConversations.map((c, i) => (
                  <motion.button
                    key={c.id}
                    className={`luna-sidebar-item ${c.id === activeConversationId ? "luna-sidebar-item-active" : ""}`}
                    onClick={() => switchConversation(c.id)}
                    initial={{ opacity: 0, x: -16 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -16 }}
                    transition={{
                      duration: 0.2,
                      delay: Math.min(i * 0.03, 0.15),
                    }}
                    whileHover={{ x: 2 }}
                  >
                    <MessageSquare size={13} className="luna-sidebar-item-icon" />
                    <span className="luna-sidebar-item-title">{c.title}</span>
                    <span className="luna-sidebar-item-time">
                      {relativeTime(c.updatedAt)}
                    </span>
                    {confirmDeleteConvId === c.id ? (
                      <span
                        className="luna-sidebar-item-delete flex items-center gap-0.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span
                          className="text-[10px] mr-0.5"
                          style={{ color: "var(--color-text-muted)" }}
                        >
                          Delete?
                        </span>
                        <button
                          className="inline-flex items-center p-0.5 rounded"
                          style={{ color: "rgba(248, 113, 113, 0.9)" }}
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteConversation(c.id);
                            setConfirmDeleteConvId(null);
                          }}
                          title="Confirm delete"
                        >
                          <Check size={11} />
                        </button>
                        <button
                          className="inline-flex items-center p-0.5 rounded"
                          style={{ color: "var(--color-text-muted)" }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDeleteConvId(null);
                          }}
                          title="Cancel"
                        >
                          <X size={11} />
                        </button>
                      </span>
                    ) : (
                      <button
                        className="luna-sidebar-item-delete"
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDeleteConvId(c.id);
                        }}
                        title="Delete conversation"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </motion.button>
                ))}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main content */}
      <div className="luna-main">
        <div className="luna-messages">
          <AnimatePresence mode="wait">
            {isEmpty ? (
              <motion.div
                key="empty"
                className="luna-empty"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.35 }}
              >
                <AiGlobe size={240} />
                {!hasDeepSeekKey && (
                  <motion.button
                    className="luna-settings-link"
                    onClick={() => setView("settings")}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2 }}
                  >
                    Open Settings to add your API key
                  </motion.button>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="chat"
                className="luna-chat-list"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2 }}
              >
                {messages.map((msg, i) => {
                  const visibleAssistantContent =
                    msg.role === "assistant"
                      ? stripCommandBlocks(msg.content, constellationHandlers)
                      : "";
                  const actionCards = actionResults[msg.id] ?? [];
                  const hasPendingAction = pendingActions.has(msg.id);
                  const isStreamingAssistantPlaceholder =
                    msg.role === "assistant" &&
                    !msg.content &&
                    i === messages.length - 1 &&
                    isStreaming;
                  const isStreamingWithContent =
                    msg.role === "assistant" &&
                    !!msg.content &&
                    i === messages.length - 1 &&
                    isStreaming;
                  const shouldRenderAssistantBubble =
                    msg.role === "assistant" &&
                    (isStreamingAssistantPlaceholder ||
                      visibleAssistantContent.trim().length > 0);
                  const showMessageActions =
                    hoveredMessageId === msg.id &&
                    !isStreaming &&
                    (msg.id === lastAssistantId || msg.id === lastUserId);

                  return (
                    <motion.div
                      key={msg.id}
                      className={`luna-msg ${msg.role === "user" ? "luna-msg-user" : "luna-msg-ai"}`}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        type: "spring",
                        stiffness: 260,
                        damping: 24,
                        delay: Math.min(i * 0.03, 0.15),
                      }}
                      onMouseEnter={() => setHoveredMessageId(msg.id)}
                      onMouseLeave={() => setHoveredMessageId(null)}
                      style={{ position: "relative" }}
                    >
                      {(msg.role === "user" || shouldRenderAssistantBubble) && (
                        <div
                          className={`luna-bubble ${msg.role === "user" ? "luna-bubble-user" : "luna-bubble-ai"}`}
                        >
                          {isStreamingAssistantPlaceholder ? (
                            <div className="luna-typing-container">
                              <span className="typing-dot" />
                              <span className="typing-dot" />
                              <span className="typing-dot" />
                            </div>
                          ) : msg.role === "assistant" ? (
                            <div className="prose-starfield">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {visibleAssistantContent}
                              </ReactMarkdown>
                              {isStreamingWithContent && (
                                <span className="luna-stream-cursor" />
                              )}
                            </div>
                          ) : (
                            <span>{msg.content}</span>
                          )}
                        </div>
                      )}

                      {/* Action result cards — rendered by each handler */}
                      {msg.role === "assistant" && actionCards.length > 0 && (
                        <div className="luna-action-results">
                          {actionCards.map((result, ri) => {
                            const handler = constellationHandlers.find(
                              (h) => h.tag === result.handler,
                            );
                            if (!handler) return null;
                            return (
                              <motion.div
                                key={ri}
                                initial={{ opacity: 0, y: 10, scale: 0.97 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                transition={{
                                  type: "spring",
                                  stiffness: 300,
                                  damping: 24,
                                  delay: ri * 0.08,
                                }}
                              >
                                <handler.ResultCard
                                  result={result}
                                  onNavigate={(v) => setView(v as AppView)}
                                />
                              </motion.div>
                            );
                          })}
                        </div>
                      )}

                      {/* Pending indicator */}
                      {msg.role === "assistant" && hasPendingAction && (
                        <div className="luna-action-pending">
                          <div className="luna-typing-container">
                            <span className="typing-dot" />
                            <span className="typing-dot" />
                            <span className="typing-dot" />
                          </div>
                          <span className="luna-action-pending-label">
                            Executing…
                          </span>
                        </div>
                      )}

                      {/* Hover action buttons */}
                      {showMessageActions && (
                        <motion.div
                          className={`luna-msg-actions ${msg.role === "user" ? "luna-msg-actions-user" : "luna-msg-actions-ai"}`}
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.15 }}
                        >
                          {msg.id === lastAssistantId && (
                            <motion.button
                              className="luna-msg-action-btn"
                              title="Retry"
                              onClick={() => void handleRetry()}
                              whileHover={{ scale: 1.12 }}
                              whileTap={{ scale: 0.9 }}
                            >
                              <RotateCcw size={11} />
                            </motion.button>
                          )}
                          {msg.id === lastUserId && (
                            <motion.button
                              className="luna-msg-action-btn"
                              title="Edit"
                              onClick={handleEdit}
                              whileHover={{ scale: 1.12 }}
                              whileTap={{ scale: 0.9 }}
                            >
                              <Pencil size={11} />
                            </motion.button>
                          )}
                        </motion.div>
                      )}
                    </motion.div>
                  );
                })}
                <div ref={bottomRef} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Input area */}
        <div className="luna-input-area">
          <div className="luna-input-container">
            <div className="luna-toolbar">
              <div className="luna-toolbar-left">
                <motion.button
                  onClick={() => setSidebarOpen((v) => !v)}
                  title="Toggle conversations"
                  className={`luna-tool-btn ${sidebarOpen ? "luna-tool-btn-active" : ""}`}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                >
                  {sidebarOpen ? (
                    <PanelLeftClose size={13} />
                  ) : (
                    <PanelLeftOpen size={13} />
                  )}
                </motion.button>
                <motion.button
                  onClick={() => hasTavilyKey && setWebSearchEnabled((v) => !v)}
                  title={
                    hasTavilyKey
                      ? "Toggle web search"
                      : "Add Tavily key in Settings"
                  }
                  className={`luna-tool-btn ${webSearchEnabled && hasTavilyKey ? "luna-tool-btn-active" : ""}`}
                  style={{
                    cursor: hasTavilyKey ? "pointer" : "not-allowed",
                    opacity: hasTavilyKey ? 1 : 0.4,
                  }}
                  whileHover={hasTavilyKey ? { scale: 1.05 } : {}}
                  whileTap={hasTavilyKey ? { scale: 0.95 } : {}}
                >
                  <Globe size={13} />
                  <span>Search</span>
                </motion.button>
                <motion.button
                  onClick={toggleConstellations}
                  title={`Constellations (${modLabel}K)`}
                  className={`luna-tool-btn ${showConstellations ? "luna-tool-btn-active" : ""}`}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Sparkles size={13} />
                  <span>Constellations</span>
                </motion.button>
              </div>
              {messages.length > 0 && (
                <motion.button
                  onClick={clearMessages}
                  className="luna-tool-btn"
                  title="Clear conversation"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                >
                  <Trash2 size={13} />
                </motion.button>
              )}
            </div>

            <div className="luna-input-row">
              <TextareaAutosize
                className="luna-textarea"
                placeholder={
                  hasDeepSeekKey ? "Message Luna…" : "API key required…"
                }
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                minRows={1}
                maxRows={5}
                disabled={isStreaming || !hasDeepSeekKey}
              />
              <motion.button
                className="luna-send-btn"
                onClick={() => void handleSend()}
                disabled={!input.trim() || isStreaming || !hasDeepSeekKey}
                title="Send"
                whileHover={!(!input.trim() || isStreaming || !hasDeepSeekKey) ? { scale: 1.1 } : {}}
                whileTap={!(!input.trim() || isStreaming || !hasDeepSeekKey) ? { scale: 0.9 } : {}}
                transition={{ type: "spring", stiffness: 400, damping: 17 }}
              >
                <ArrowUp size={16} />
              </motion.button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
