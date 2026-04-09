import { useState, useRef, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trash2, Globe, ArrowUp, PanelLeftOpen, PanelLeftClose, Plus, MessageSquare, X } from "lucide-react";
import TextareaAutosize from "react-textarea-autosize";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CosmicLogo } from "../components/CosmicLogo";
import { useAppStore, MAX_CONVERSATION_TITLE_LENGTH } from "../store/useAppStore";
import { useOrbitStore } from "../store/useOrbitStore";
import { streamLuna, webSearch } from "../lib/tauri";
import type { ChatMessagePayload } from "../lib/tauri";
import { extractMemories } from "../lib/memory";
import type { OrbitContext } from "../lib/luna-prompt";

// ── Orbit command parser ─────────────────────────────────────────────────────

function parseAndExecuteOrbitCommands(
  response: string,
  orbitActions: {
    createTask: (data: { title: string; description?: string | null; priority?: "low" | "medium" | "high"; due_date?: string | null }) => string;
    completeTask: (id: string) => void;
    uncompleteTask: (id: string) => void;
    archiveTask: (id: string) => void;
    deleteTask: (id: string) => void;
    createNote: (data: { title: string; content?: string | null }) => string;
    deleteNote: (id: string) => void;
  },
): boolean {
  const blockMatch = response.match(/```orbit-commands\n([\s\S]*?)```/);
  if (!blockMatch) return false;

  const lines = blockMatch[1].trim().split("\n");
  let executed = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const spaceIdx = trimmed.indexOf(" ");
    const command = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
    const jsonStr = spaceIdx === -1 ? "{}" : trimmed.slice(spaceIdx + 1);

    try {
      const args = JSON.parse(jsonStr) as Record<string, unknown>;
      switch (command) {
        case "CREATE_TASK": {
          const rawDue = args.due_date;
          const dueDate =
            rawDue != null && rawDue !== "null" && typeof rawDue === "string" && rawDue.trim() !== ""
              ? rawDue
              : null;
          orbitActions.createTask({
            title: String(args.title ?? ""),
            description: args.description != null && args.description !== "null" ? String(args.description) : null,
            priority: (["low", "medium", "high"].includes(String(args.priority)) ? args.priority : "medium") as "low" | "medium" | "high",
            due_date: dueDate,
          });
          executed = true;
          break;
        }
        case "COMPLETE_TASK":
          orbitActions.completeTask(String(args.id ?? ""));
          executed = true;
          break;
        case "UNCOMPLETE_TASK":
          orbitActions.uncompleteTask(String(args.id ?? ""));
          executed = true;
          break;
        case "ARCHIVE_TASK":
          orbitActions.archiveTask(String(args.id ?? ""));
          executed = true;
          break;
        case "DELETE_TASK":
          orbitActions.deleteTask(String(args.id ?? ""));
          executed = true;
          break;
        case "CREATE_NOTE":
          orbitActions.createNote({
            title: String(args.title ?? ""),
            content: args.content != null ? String(args.content) : null,
          });
          executed = true;
          break;
        case "DELETE_NOTE":
          orbitActions.deleteNote(String(args.id ?? ""));
          executed = true;
          break;
      }
    } catch {
      // skip malformed command lines
    }
  }

  return executed;
}

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
    memories,
    addMemory,
    isStreaming,
    setIsStreaming,
    hasDeepSeekKey,
    hasTavilyKey,
    setView,
  } = useAppStore();

  const {
    tasks,
    notes,
    createTask,
    completeTask,
    uncompleteTask,
    archiveTask,
    deleteTask,
    createNote,
    deleteNote,
  } = useOrbitStore();

  const activeConvo = conversations.find((c) => c.id === activeConversationId);
  const messages = activeConvo?.messages ?? [];

  const [input, setInput] = useState("");
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const sortedConversations = useMemo(
    () => [...conversations].sort((a, b) => b.updatedAt - a.updatedAt),
    [conversations],
  );

  const memoryStrings = useMemo(
    () => memories.map((m) => m.content),
    [memories],
  );

  // Build orbit context for Luna's system prompt
  const orbitContext = useMemo((): OrbitContext => ({
    activeTasks: tasks
      .filter((t) => !t.archived)
      .map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        priority: t.priority,
        due_date: t.due_date,
      })),
    notes: notes.map((n) => ({
      id: n.id,
      title: n.title,
      content: n.content,
    })),
  }), [tasks, notes]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isStreaming || !hasDeepSeekKey) return;

    // Ensure we have an active conversation
    if (!activeConversationId) createConversation();

    setInput("");
    const isFirstMessage = messages.length === 0;

    addMessage({ id: crypto.randomUUID(), role: "user", content: text, timestamp: Date.now() });
    setIsStreaming(true);
    addMessage({ id: crypto.randomUUID(), role: "assistant", content: "", timestamp: Date.now() });

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
                .map((r, i) => `${i + 1}. **${r.title}** (${r.url})\n${r.content}`)
                .join("\n\n") +
              "\n[End of web search results]\n\n";
          }
        } catch {
          // silently skip search errors
        }
      }

      const historyMessages: ChatMessagePayload[] = messages
        .filter((m) => m.content.length > 0)
        .slice(-20)
        .map((m) => ({ role: m.role, content: m.content }));

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
        memoryStrings,
        orbitContext,
      );

      // Parse and execute any orbit commands in the response
      parseAndExecuteOrbitCommands(accumulated, {
        createTask,
        completeTask,
        uncompleteTask,
        archiveTask,
        deleteTask,
        createNote,
        deleteNote,
      });

      // Auto-title: use first ~40 chars of first user message
      if (isFirstMessage && activeConversationId) {
        renameConversation(activeConversationId, text.slice(0, MAX_CONVERSATION_TITLE_LENGTH));
      }

      // Auto-extract memories
      const extracted = extractMemories(text, accumulated);
      for (const mem of extracted) {
        addMemory(mem);
      }
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

  const handleNewConversation = () => {
    createConversation();
  };

  const handleDeleteConversation = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    deleteConversation(id);
  };

  const isEmpty = messages.length === 0;

  return (
    <div className="luna-shell">
      {/* Sidebar */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            className="luna-sidebar"
            initial={{ x: -260, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -260, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            <div className="luna-sidebar-header">
              <button className="luna-sidebar-new" onClick={handleNewConversation}>
                <Plus size={14} />
                <span>New Conversation</span>
              </button>
              <button
                className="luna-tool-btn"
                onClick={() => setSidebarOpen(false)}
                title="Close sidebar"
              >
                <PanelLeftClose size={15} />
              </button>
            </div>
            <div className="luna-sidebar-list">
              {sortedConversations.map((c) => (
                <button
                  key={c.id}
                  className={`luna-sidebar-item ${c.id === activeConversationId ? "luna-sidebar-item-active" : ""}`}
                  onClick={() => switchConversation(c.id)}
                >
                  <MessageSquare size={13} className="luna-sidebar-item-icon" />
                  <span className="luna-sidebar-item-title">{c.title}</span>
                  <button
                    className="luna-sidebar-item-delete"
                    onClick={(e) => handleDeleteConversation(e, c.id)}
                    title="Delete conversation"
                  >
                    <X size={12} />
                  </button>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main content */}
      <div className="luna-main">
        {/* Messages area */}
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
                <div className="luna-orb">
                  <CosmicLogo size={120} />
                </div>
                <p className="luna-greeting">
                  {hasDeepSeekKey
                    ? "What can I help you with?"
                    : "Add a DeepSeek API key to get started."}
                </p>
                {!hasDeepSeekKey && (
                  <button
                    className="luna-settings-link"
                    onClick={() => setView("settings")}
                  >
                    Open Settings
                  </button>
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
                {messages.map((msg, i) => (
                  <motion.div
                    key={msg.id}
                    className={`luna-msg ${msg.role === "user" ? "luna-msg-user" : "luna-msg-ai"}`}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, delay: Math.min(i * 0.03, 0.15) }}
                  >
                    <div className={`luna-bubble ${msg.role === "user" ? "luna-bubble-user" : "luna-bubble-ai"}`}>
                      {msg.role === "assistant" && !msg.content && i === messages.length - 1 && isStreaming ? (
                        <div className="flex gap-1 items-center h-4">
                          <span className="typing-dot" />
                          <span className="typing-dot" />
                          <span className="typing-dot" />
                        </div>
                      ) : msg.role === "assistant" ? (
                        <div className="prose-starfield">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {msg.content.replace(/```orbit-commands[\s\S]*?```/g, "").trimEnd()}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        <span>{msg.content}</span>
                      )}
                    </div>
                  </motion.div>
                ))}
                <div ref={bottomRef} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Input area */}
        <div className="luna-input-area">
          <div className="luna-input-container">
            {/* Toolbar row */}
            <div className="luna-toolbar">
              <div className="luna-toolbar-left">
                <button
                  onClick={() => setSidebarOpen((v) => !v)}
                  title="Toggle conversations"
                  className="luna-tool-btn"
                >
                  {sidebarOpen ? <PanelLeftClose size={13} /> : <PanelLeftOpen size={13} />}
                </button>
                <button
                  onClick={() => hasTavilyKey && setWebSearchEnabled((v) => !v)}
                  title={hasTavilyKey ? "Toggle web search" : "Add Tavily key in Settings"}
                  className={`luna-tool-btn ${webSearchEnabled && hasTavilyKey ? "luna-tool-btn-active" : ""}`}
                  style={{ cursor: hasTavilyKey ? "pointer" : "not-allowed", opacity: hasTavilyKey ? 1 : 0.4 }}
                >
                  <Globe size={13} />
                  <span>Search</span>
                </button>
              </div>
              {messages.length > 0 && (
                <button
                  onClick={clearMessages}
                  className="luna-tool-btn"
                  title="Clear conversation"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>

            {/* Input row */}
            <div className="luna-input-row">
              <TextareaAutosize
                className="luna-textarea"
                placeholder={hasDeepSeekKey ? "Message Luna…" : "API key required…"}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                minRows={1}
                maxRows={5}
                disabled={isStreaming || !hasDeepSeekKey}
              />
              <button
                className="luna-send-btn"
                onClick={() => void handleSend()}
                disabled={!input.trim() || isStreaming || !hasDeepSeekKey}
                title="Send"
              >
                <ArrowUp size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
