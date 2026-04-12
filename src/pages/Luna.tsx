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
  Copy,
  CheckCheck,
  HelpCircle,
  ShoppingCart,
  AlignLeft,
  Sparkle,
  Search,
  Languages,
  Settings,
} from "lucide-react";
import TextareaAutosize from "react-textarea-autosize";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import { CosmicEntity, type EntityMood } from "../components/CosmicEntity";
import { StarParticles } from "../components/StarParticles";
import { Switch } from "../components/Switch";
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
import {
  getConstellation,
  type ConstellationId,
} from "../lib/constellation-catalog";
import { prefetchPage } from "../App";
import type {
  LunaControls,
  SessionMode,
  ClarificationQuestion,
  DecisionStyle,
  PersonalityIntensity,
  CreativityLevel,
  ResponseStyle,
} from "../lib/luna-prompt";
import {
  loadLunaControls,
  saveSettings,
  MODE_CLARIFICATIONS,
} from "../lib/luna-prompt";
import { ClarificationCard } from "../components/ClarificationCard";

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
    startWormhole,
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
  const streamAborted = useRef(false);

  const [controlsOpen, setControlsOpen] = useState(false);
  const [lunaControls, setLunaControls] =
    useState<LunaControls>(loadLunaControls);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);

  // Per-conversation session modes (not persisted — session-only)
  const sessionModesRef = useRef<
    Record<
      string,
      { shopping: boolean; research: boolean; translation: boolean }
    >
  >({});

  // Clarification card data keyed by assistant message ID
  const clarificationData = useRef<Record<string, ClarificationQuestion[]>>({});

  // Sync session modes when switching conversations
  useEffect(() => {
    if (!activeConversationId) return;
    const stored = sessionModesRef.current[activeConversationId] ?? {
      shopping: false,
      research: false,
      translation: false,
    };
    setLunaControls((prev) => ({
      ...prev,
      shopping: stored.shopping,
      research: stored.research,
      translation: stored.translation,
    }));
  }, [activeConversationId]);

  // Cleanup: if component unmounts while streaming, clear the streaming state
  useEffect(() => {
    return () => {
      if (streamAborted.current) return;
      const state = useAppStore.getState();
      if (state.isStreaming) {
        state.setIsStreaming(false);
        // Remove the empty/partial assistant message left by the aborted stream
        state.removeLastAssistantMessage();
      }
    };
  }, []);

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
      if (fallbackView && !results.some((r) => r.type === "navigated")) {
        results.push({
          type: "navigated",
          handler: "navigate-commands",
          to: fallbackView,
        });
        prefetchPage(fallbackView);
        const entry = getConstellation(fallbackView as ConstellationId);
        startWormhole(fallbackView, entry?.glowHex ?? "#7c4ff0");
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
    [startWormhole],
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
          lunaControls,
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
        streamAborted.current = true; // Stream completed successfully
      } catch (e) {
        updateLastAssistantMessage(`Error: ${String(e)}`);
        streamAborted.current = true; // Stream errored, no cleanup needed
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
      lunaControls,
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

  // ── Session mode activation (mutual exclusion + clarification card) ──
  const handleModeActivation = useCallback(
    (mode: SessionMode, enabled: boolean) => {
      // Build controls with mutual exclusion
      const next: LunaControls = {
        ...lunaControls,
        shopping: false,
        research: false,
        translation: false,
        [mode]: enabled,
      };
      setLunaControls(next);

      // Persist modes to per-conversation ref
      if (activeConversationId) {
        sessionModesRef.current[activeConversationId] = {
          shopping: next.shopping,
          research: next.research,
          translation: next.translation,
        };
      }

      // If disabling, just clear state — no card needed
      if (!enabled) return;

      setControlsOpen(false);

      // Auto-enable web search for internet-backed session modes.
      if (hasTavilyKey) {
        setWebSearchEnabled(true);
      }

      // Ensure conversation exists
      const convId = activeConversationId ?? createConversation();

      // Rename if this is the first message
      if (messages.length === 0 && convId) {
        renameConversation(
          convId,
          `${mode.charAt(0).toUpperCase() + mode.slice(1)} Session`,
        );
      }

      // Add the mode activation user message
      addMessage({
        id: crypto.randomUUID(),
        role: "user",
        content: `${mode.charAt(0).toUpperCase() + mode.slice(1)} Mode`,
        timestamp: Date.now(),
      });

      // Add an empty assistant message and attach the clarification questions
      const assistantMsgId = crypto.randomUUID();
      clarificationData.current[assistantMsgId] = MODE_CLARIFICATIONS[mode];
      addMessage({
        id: assistantMsgId,
        role: "assistant",
        content: "",
        timestamp: Date.now(),
      });
    },
    [
      lunaControls,
      activeConversationId,
      createConversation,
      addMessage,
      messages.length,
      renameConversation,
      hasTavilyKey,
      setWebSearchEnabled,
    ],
  );

  // ── Clarification card submission ─────────────────────────────────────
  const handleClarificationSubmit = useCallback(
    async (
      questions: ClarificationQuestion[],
      answers: Record<string, string>,
    ) => {
      const text = questions
        .map((q) => `${q.label}: ${answers[q.id] ?? ""}`)
        .filter((line) => !line.endsWith(": "))
        .join("\n");
      if (!text.trim()) return;

      addMessage({
        id: crypto.randomUUID(),
        role: "user",
        content: text,
        timestamp: Date.now(),
        hidden: true,
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

      await runStream(text, historyMessages, assistantMsgId, false, null);
    },
    [messages, addMessage, setIsStreaming, runStream],
  );

  const handleCopyMessage = useCallback((content: string, id: string) => {
    navigator.clipboard.writeText(content).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  }, []);

  const handleCopyCode = useCallback((code: string, id: string) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopiedCodeId(id);
      setTimeout(() => setCopiedCodeId(null), 2000);
    });
  }, []);

  const isEmpty = messages.length === 0;
  const lastAssistantId = [...messages]
    .reverse()
    .find((m) => m.role === "assistant" && !m.hidden)?.id;
  const lastUserId = [...messages]
    .reverse()
    .find((m) => m.role === "user" && !m.hidden)?.id;

  // Derive the cosmic entity's mood from interaction state
  let entityMood: EntityMood = "idle";
  if (isStreaming) {
    const lastMsg = messages[messages.length - 1];
    entityMood =
      lastMsg?.role === "assistant" && lastMsg.content.length > 0
        ? "speaking"
        : "thinking";
  } else if (input.trim().length > 0) {
    entityMood = "listening";
  }

  const markdownComponents: Components = useMemo(
    () => ({
      a: ({ href, children }) => (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="luna-link"
          onClick={(e) => {
            if (href) {
              e.preventDefault();
              window.open(href, "_blank", "noopener,noreferrer");
            }
          }}
        >
          {children}
        </a>
      ),
      table: ({ children }) => (
        <div className="luna-table-wrapper">
          <table className="luna-table">{children}</table>
        </div>
      ),
      th: ({ children }) => <th className="luna-th">{children}</th>,
      td: ({ children }) => <td className="luna-td">{children}</td>,
      code: ({ className, children, ...props }) => {
        const match = /language-(\w+)/.exec(className || "");
        const isInline = !match && !className;
        const codeId = `code-${Math.random().toString(36).substr(2, 9)}`;
        const codeContent = String(children).replace(/\n$/, "");

        if (isInline) {
          return <code className="luna-inline-code">{children}</code>;
        }

        return (
          <div className="luna-code-block">
            <div className="luna-code-header">
              <span className="luna-code-lang">
                {match ? match[1] : "code"}
              </span>
              <button
                className="luna-code-copy"
                onClick={() => handleCopyCode(codeContent, codeId)}
                title="Copy code"
              >
                {copiedCodeId === codeId ? (
                  <CheckCheck size={13} />
                ) : (
                  <Copy size={13} />
                )}
              </button>
            </div>
            <pre className="luna-pre">
              <code className={className} {...props}>
                {children}
              </code>
            </pre>
          </div>
        );
      },
      pre: ({ children }) => <>{children}</>,
    }),
    [handleCopyCode, copiedCodeId],
  );

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
                    <MessageSquare
                      size={13}
                      className="luna-sidebar-item-icon"
                    />
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
                <CosmicEntity size={320} mood={entityMood} />
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
                <div className="luna-entity-mini">
                  <CosmicEntity size={68} mood={entityMood} />
                </div>
                {messages.map((msg, i) => {
                  if (msg.hidden) return null;
                  const visibleAssistantContent =
                    msg.role === "assistant"
                      ? stripCommandBlocks(msg.content, constellationHandlers)
                      : "";
                  const actionCards = actionResults[msg.id] ?? [];
                  const hasPendingAction = pendingActions.has(msg.id);
                  const hasClarificationCard =
                    !!clarificationData.current[msg.id];
                  const isStreamingAssistantPlaceholder =
                    msg.role === "assistant" &&
                    !msg.content &&
                    !hasClarificationCard &&
                    i === messages.length - 1 &&
                    isStreaming;
                  const isStreamingWithContent =
                    msg.role === "assistant" &&
                    !!msg.content &&
                    i === messages.length - 1 &&
                    isStreaming;
                  const shouldRenderAssistantBubble =
                    msg.role === "assistant" &&
                    !hasClarificationCard &&
                    (isStreamingAssistantPlaceholder ||
                      visibleAssistantContent.trim().length > 0);
                  const showMessageActions =
                    hoveredMessageId === msg.id &&
                    !isStreaming &&
                    !hasClarificationCard &&
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
                      {/* User bubble */}
                      {msg.role === "user" && (
                        <div className="luna-bubble luna-bubble-user">
                          <span>{msg.content}</span>
                        </div>
                      )}

                      {/* AI: clarification card (replaces bubble) */}
                      {hasClarificationCard && (
                        <ClarificationCard
                          questions={clarificationData.current[msg.id]}
                          disabled={isStreaming || msg.id !== lastAssistantId}
                          onSubmit={(answers) =>
                            handleClarificationSubmit(
                              clarificationData.current[msg.id],
                              answers,
                            )
                          }
                        />
                      )}

                      {/* AI: normal markdown bubble */}
                      {shouldRenderAssistantBubble && (
                        <div className="luna-bubble luna-bubble-ai">
                          {isStreamingAssistantPlaceholder ? (
                            <div className="luna-typing-container">
                              <span className="typing-dot" />
                              <span className="typing-dot" />
                              <span className="typing-dot" />
                            </div>
                          ) : (
                            <div className="prose-starfield">
                              <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={markdownComponents}
                              >
                                {visibleAssistantContent}
                              </ReactMarkdown>
                              {isStreamingWithContent && (
                                <span className="luna-stream-cursor" />
                              )}
                            </div>
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
                                  onNavigate={(v) => {
                                    const id = v as ConstellationId;
                                    prefetchPage(id);
                                    const entry = getConstellation(id);
                                    startWormhole(
                                      id as Exclude<
                                        AppView,
                                        "luna" | "settings"
                                      >,
                                      entry?.glowHex ?? "#7c4ff0",
                                    );
                                  }}
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
                          <motion.button
                            className="luna-msg-action-btn"
                            title="Copy"
                            onClick={() =>
                              handleCopyMessage(
                                msg.role === "assistant"
                                  ? visibleAssistantContent
                                  : msg.content,
                                msg.id,
                              )
                            }
                            whileHover={{ scale: 1.12 }}
                            whileTap={{ scale: 0.9 }}
                          >
                            {copiedId === msg.id ? (
                              <CheckCheck size={11} />
                            ) : (
                              <Copy size={11} />
                            )}
                          </motion.button>
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
                <motion.button
                  onClick={() => setControlsOpen(true)}
                  title="Luna Controls"
                  className={`luna-tool-btn ${controlsOpen ? "luna-tool-btn-active" : ""}`}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Settings size={13} />
                  <span>Controls</span>
                </motion.button>
              </div>
              <div className="luna-toolbar-right">
                <div className="luna-modes-bar">
                  {lunaControls.shopping && (
                    <span className="luna-mode-badge luna-mode-shopping">
                      <ShoppingCart size={10} />
                    </span>
                  )}
                  {lunaControls.research && (
                    <span className="luna-mode-badge luna-mode-research">
                      <Search size={10} />
                    </span>
                  )}
                  {lunaControls.translation && (
                    <span className="luna-mode-badge luna-mode-translation">
                      <Languages size={10} />
                    </span>
                  )}
                  {lunaControls.clarification && (
                    <span className="luna-mode-badge luna-mode-clarify">
                      <HelpCircle size={10} />
                    </span>
                  )}
                </div>
                {messages.length > 0 && (
                  <motion.button
                    onClick={() => {
                      if (activeConversationId) {
                        sessionModesRef.current[activeConversationId] = {
                          shopping: false,
                          research: false,
                          translation: false,
                        };
                      }
                      setLunaControls((prev) => ({
                        ...prev,
                        shopping: false,
                        research: false,
                        translation: false,
                      }));
                      clearMessages();
                    }}
                    className="luna-tool-btn"
                    title="Clear conversation"
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                  >
                    <Trash2 size={13} />
                  </motion.button>
                )}
              </div>
            </div>

            <AnimatePresence>
              {controlsOpen && (
                <motion.div
                  className="luna-modal-overlay"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setControlsOpen(false)}
                >
                  <motion.div
                    className="luna-modal-card"
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="luna-modal-header">
                      <h2 className="luna-modal-title">
                        <Sparkle size={16} />
                        Luna Controls
                      </h2>
                      <button
                        className="luna-modal-close"
                        onClick={() => setControlsOpen(false)}
                      >
                        <X size={16} />
                      </button>
                    </div>

                    <div className="luna-modal-content">
                      <div className="luna-modal-section">
                        <h3 className="luna-modal-section-title">Tuning</h3>
                        <div className="luna-modal-grid">
                          <div className="luna-control-item">
                            <label className="luna-control-label">
                              <HelpCircle size={12} />
                              Decision Style
                            </label>
                            <div className="luna-radio-group">
                              {(
                                [
                                  "measured",
                                  "balanced",
                                  "decisive",
                                ] as DecisionStyle[]
                              ).map((v) => (
                                <button
                                  key={v}
                                  type="button"
                                  className={`luna-radio-btn ${lunaControls.decisionStyle === v ? "luna-radio-btn-active" : ""}`}
                                  onClick={() => {
                                    const next = {
                                      ...lunaControls,
                                      decisionStyle: v,
                                    };
                                    setLunaControls(next);
                                    saveSettings({ decisionStyle: v });
                                  }}
                                >
                                  {v.charAt(0).toUpperCase() + v.slice(1)}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="luna-control-item">
                            <label className="luna-control-label">
                              <Sparkle size={12} />
                              Personality
                            </label>
                            <div className="luna-radio-group">
                              {(
                                [
                                  "subtle",
                                  "balanced",
                                  "sharp",
                                ] as PersonalityIntensity[]
                              ).map((v) => (
                                <button
                                  key={v}
                                  type="button"
                                  className={`luna-radio-btn ${lunaControls.personalityIntensity === v ? "luna-radio-btn-active" : ""}`}
                                  onClick={() => {
                                    const next = {
                                      ...lunaControls,
                                      personalityIntensity: v,
                                    };
                                    setLunaControls(next);
                                    saveSettings({ personalityIntensity: v });
                                  }}
                                >
                                  {v.charAt(0).toUpperCase() + v.slice(1)}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="luna-control-item">
                            <label className="luna-control-label">
                              <Sparkle size={12} />
                              Creativity
                            </label>
                            <div className="luna-radio-group">
                              {(
                                [
                                  "neutral",
                                  "moderate",
                                  "creative",
                                ] as CreativityLevel[]
                              ).map((v) => (
                                <button
                                  key={v}
                                  type="button"
                                  className={`luna-radio-btn ${lunaControls.creativity === v ? "luna-radio-btn-active" : ""}`}
                                  onClick={() => {
                                    const next = {
                                      ...lunaControls,
                                      creativity: v,
                                    };
                                    setLunaControls(next);
                                    saveSettings({ creativity: v });
                                  }}
                                >
                                  {v.charAt(0).toUpperCase() + v.slice(1)}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="luna-control-item">
                            <label className="luna-control-label">
                              <AlignLeft size={12} />
                              Response Style
                            </label>
                            <div className="luna-radio-group">
                              {(
                                [
                                  { value: "concise", label: "Concise" },
                                  { value: "balanced", label: "Balanced" },
                                  { value: "detailed", label: "Detailed" },
                                ] as { value: ResponseStyle; label: string }[]
                              ).map((opt) => (
                                <button
                                  key={opt.value}
                                  type="button"
                                  className={`luna-radio-btn ${lunaControls.responseStyle === opt.value ? "luna-radio-btn-active" : ""}`}
                                  onClick={() => {
                                    const next = {
                                      ...lunaControls,
                                      responseStyle: opt.value,
                                    };
                                    setLunaControls(next);
                                    saveSettings({ responseStyle: opt.value });
                                  }}
                                >
                                  {opt.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="luna-modal-section">
                        <h3 className="luna-modal-section-title">
                          Clarification
                        </h3>
                        <p className="luna-modal-section-desc">
                          Luna will ask follow-up questions when your message is
                          ambiguous. This setting persists.
                        </p>
                        <div className="luna-clarify-card">
                          <div className="luna-clarify-card-left">
                            <HelpCircle size={18} />
                            <div>
                              <div className="luna-clarify-card-title">
                                Always clarify
                              </div>
                              <div className="luna-clarify-card-desc">
                                Ask before answering if intent is unclear
                              </div>
                            </div>
                          </div>
                          <Switch
                            checked={lunaControls.clarification}
                            onChange={(checked) => {
                              const next = {
                                ...lunaControls,
                                clarification: checked,
                              };
                              setLunaControls(next);
                              saveSettings({ clarification: checked });
                            }}
                          />
                        </div>
                      </div>

                      <div className="luna-modal-section">
                        <h3 className="luna-modal-section-title">
                          Session Modes
                        </h3>
                        <p className="luna-modal-section-desc">
                          Temporary modes for this conversation only. Activating
                          one deactivates the others. Reset when you start a new
                          conversation.
                        </p>
                        <div className="luna-modes-grid">
                          <button
                            type="button"
                            className={`luna-mode-card ${lunaControls.shopping ? "luna-mode-card-active-shopping" : ""}`}
                            disabled={isStreaming || !hasDeepSeekKey}
                            onClick={() =>
                              handleModeActivation(
                                "shopping",
                                !lunaControls.shopping,
                              )
                            }
                          >
                            <div className="luna-mode-card-header">
                              <ShoppingCart size={16} />
                              <span>Shopping</span>
                            </div>
                            <p className="luna-mode-card-desc">
                              Product comparisons, pros/cons, recommendations
                            </p>
                            <div
                              className={`luna-mode-indicator ${lunaControls.shopping ? "luna-mode-indicator-on" : ""}`}
                            />
                          </button>

                          <button
                            type="button"
                            className={`luna-mode-card ${lunaControls.research ? "luna-mode-card-active-research" : ""}`}
                            disabled={isStreaming || !hasDeepSeekKey}
                            onClick={() =>
                              handleModeActivation(
                                "research",
                                !lunaControls.research,
                              )
                            }
                          >
                            <div className="luna-mode-card-header">
                              <Search size={16} />
                              <span>Research</span>
                            </div>
                            <p className="luna-mode-card-desc">
                              Deep analysis, sources, thorough breakdowns
                            </p>
                            <div
                              className={`luna-mode-indicator ${lunaControls.research ? "luna-mode-indicator-on" : ""}`}
                            />
                          </button>

                          <button
                            type="button"
                            className={`luna-mode-card ${lunaControls.translation ? "luna-mode-card-active-translation" : ""}`}
                            disabled={isStreaming || !hasDeepSeekKey}
                            onClick={() =>
                              handleModeActivation(
                                "translation",
                                !lunaControls.translation,
                              )
                            }
                          >
                            <div className="luna-mode-card-header">
                              <Languages size={16} />
                              <span>Translation</span>
                            </div>
                            <p className="luna-mode-card-desc">
                              Accurate translation with cultural context
                            </p>
                            <div
                              className={`luna-mode-indicator ${lunaControls.translation ? "luna-mode-indicator-on" : ""}`}
                            />
                          </button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

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
                whileHover={
                  !(!input.trim() || isStreaming || !hasDeepSeekKey)
                    ? { scale: 1.1 }
                    : {}
                }
                whileTap={
                  !(!input.trim() || isStreaming || !hasDeepSeekKey)
                    ? { scale: 0.9 }
                    : {}
                }
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
