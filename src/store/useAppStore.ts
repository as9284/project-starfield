import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  /** If true, the message is part of context but not rendered in the chat. */
  hidden?: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

export interface Memory {
  id: string;
  content: string;
  createdAt: number;
}

export type AppView =
  | "luna"
  | "orbit"
  | "solaris"
  | "beacon"
  | "pulsar"
  | "hyperlane"
  | "settings";

interface AppState {
  // Navigation
  view: AppView;
  previousView: Exclude<AppView, "settings">;
  showConstellations: boolean;
  setView: (v: AppView) => void;
  goBack: () => void;
  openConstellations: () => void;
  closeConstellations: () => void;
  toggleConstellations: () => void;

  // API keys (stored in OS keychain; these flags track presence)
  hasDeepSeekKey: boolean;
  setHasDeepSeekKey: (v: boolean) => void;
  hasTavilyKey: boolean;
  setHasTavilyKey: (v: boolean) => void;
  hasWeatherKey: boolean;
  setHasWeatherKey: (v: boolean) => void;

  // Conversations
  conversations: Conversation[];
  activeConversationId: string | null;
  createConversation: () => string;
  switchConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
  renameConversation: (id: string, title: string) => void;

  // Active conversation messages (operate on active conversation)
  addMessage: (m: ChatMessage) => void;
  updateLastAssistantMessage: (text: string) => void;
  clearMessages: () => void;
  /** Remove the last assistant message (for retry). */
  removeLastAssistantMessage: () => void;
  /** Remove the last user message and everything after it. Returns removed user content. */
  removeFromLastUserMessage: () => string;

  // Memories
  memories: Memory[];
  addMemory: (content: string) => void;
  removeMemory: (id: string) => void;
  clearMemories: () => void;
  importMemories: (memories: Memory[]) => void;

  // Streaming state
  isStreaming: boolean;
  setIsStreaming: (v: boolean) => void;

  // Performance mode — reduces animation quality to lower GPU usage
  performanceMode: boolean;
  setPerformanceMode: (v: boolean) => void;

  // Wormhole launch transition
  wormholeTarget: {
    id: Exclude<AppView, "luna" | "settings">;
    color: string;
  } | null;
  startWormhole: (
    id: Exclude<AppView, "luna" | "settings">,
    color: string,
  ) => void;
  clearWormhole: () => void;
}

export const MAX_CONVERSATION_TITLE_LENGTH = 40;

function makeConversation(): Conversation {
  return {
    id: crypto.randomUUID(),
    title: "New Conversation",
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function getActiveConvo(state: {
  conversations: Conversation[];
  activeConversationId: string | null;
}) {
  return state.conversations.find((c) => c.id === state.activeConversationId);
}

function updateActiveConvo(
  state: { conversations: Conversation[]; activeConversationId: string | null },
  updater: (c: Conversation) => Conversation,
) {
  return state.conversations.map((c) =>
    c.id === state.activeConversationId ? updater(c) : c,
  );
}

/** Check if a memory is similar enough to be considered a duplicate. */
function isSimilarMemory(a: string, b: string): boolean {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, "")
      .trim();
  const na = normalize(a);
  const nb = normalize(b);
  return na === nb || na.includes(nb) || nb.includes(na);
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => {
      const initial = makeConversation();
      return {
        view: "luna",
        previousView: "luna",
        showConstellations: false,
        setView: (v) =>
          set((state) => {
            if (v === "settings") {
              return {
                view: v,
                showConstellations: false,
                previousView:
                  state.view === "settings"
                    ? state.previousView
                    : (state.view as Exclude<AppView, "settings">),
              };
            }
            return { view: v, previousView: v, showConstellations: false };
          }),
        goBack: () =>
          set((state) => ({
            view: state.view === "settings" ? state.previousView : "luna",
            showConstellations: false,
          })),
        openConstellations: () => set({ showConstellations: true }),
        closeConstellations: () => set({ showConstellations: false }),
        toggleConstellations: () =>
          set((state) => ({ showConstellations: !state.showConstellations })),

        hasDeepSeekKey: false,
        setHasDeepSeekKey: (v) => set({ hasDeepSeekKey: v }),
        hasTavilyKey: false,
        setHasTavilyKey: (v) => set({ hasTavilyKey: v }),
        hasWeatherKey: false,
        setHasWeatherKey: (v) => set({ hasWeatherKey: v }),

        // Conversations
        conversations: [initial],
        activeConversationId: initial.id,

        createConversation: () => {
          const c = makeConversation();
          set((s) => ({
            conversations: [c, ...s.conversations],
            activeConversationId: c.id,
          }));
          return c.id;
        },

        switchConversation: (id) => {
          const state = get();
          if (state.conversations.some((c) => c.id === id)) {
            set({ activeConversationId: id });
          }
        },

        deleteConversation: (id) =>
          set((s) => {
            const remaining = s.conversations.filter((c) => c.id !== id);
            if (remaining.length === 0) {
              const fresh = makeConversation();
              return { conversations: [fresh], activeConversationId: fresh.id };
            }
            const needSwitch = s.activeConversationId === id;
            return {
              conversations: remaining,
              activeConversationId: needSwitch
                ? remaining[0].id
                : s.activeConversationId,
            };
          }),

        renameConversation: (id, title) =>
          set((s) => ({
            conversations: s.conversations.map((c) =>
              c.id === id ? { ...c, title, updatedAt: Date.now() } : c,
            ),
          })),

        // Messages — operate on active conversation
        addMessage: (m) =>
          set((s) => {
            if (!getActiveConvo(s)) return s;
            return {
              conversations: updateActiveConvo(s, (c) => ({
                ...c,
                messages: [...c.messages, m],
                updatedAt: Date.now(),
              })),
            };
          }),

        updateLastAssistantMessage: (text) =>
          set((s) => {
            if (!getActiveConvo(s)) return s;
            return {
              conversations: updateActiveConvo(s, (c) => {
                const msgs = [...c.messages];
                for (let i = msgs.length - 1; i >= 0; i--) {
                  if (msgs[i].role === "assistant") {
                    msgs[i] = { ...msgs[i], content: text };
                    break;
                  }
                }
                return { ...c, messages: msgs, updatedAt: Date.now() };
              }),
            };
          }),

        clearMessages: () =>
          set((s) => {
            if (!getActiveConvo(s)) return s;
            return {
              conversations: updateActiveConvo(s, (c) => ({
                ...c,
                messages: [],
                title: "New Conversation",
                updatedAt: Date.now(),
              })),
            };
          }),

        removeLastAssistantMessage: () =>
          set((s) => {
            if (!getActiveConvo(s)) return s;
            return {
              conversations: updateActiveConvo(s, (c) => {
                const lastAssistantIdx = [...c.messages]
                  .reverse()
                  .findIndex((m) => m.role === "assistant");
                if (lastAssistantIdx === -1) return c;
                const idx = c.messages.length - 1 - lastAssistantIdx;
                const msgs = [
                  ...c.messages.slice(0, idx),
                  ...c.messages.slice(idx + 1),
                ];
                return { ...c, messages: msgs, updatedAt: Date.now() };
              }),
            };
          }),

        removeFromLastUserMessage: () => {
          let content = "";
          set((s) => {
            if (!getActiveConvo(s)) return s;
            return {
              conversations: updateActiveConvo(s, (c) => {
                const msgs = [...c.messages];
                let lastUserIdx = -1;
                for (let i = msgs.length - 1; i >= 0; i--) {
                  if (msgs[i].role === "user" && !msgs[i].hidden) {
                    lastUserIdx = i;
                    content = msgs[i].content;
                    break;
                  }
                }
                if (lastUserIdx === -1) return c;
                return {
                  ...c,
                  messages: msgs.slice(0, lastUserIdx),
                  updatedAt: Date.now(),
                };
              }),
            };
          });
          return content;
        },

        // Memories
        memories: [],

        addMemory: (content) =>
          set((s) => {
            if (s.memories.some((m) => isSimilarMemory(m.content, content)))
              return s;
            return {
              memories: [
                ...s.memories,
                { id: crypto.randomUUID(), content, createdAt: Date.now() },
              ],
            };
          }),

        removeMemory: (id) =>
          set((s) => ({ memories: s.memories.filter((m) => m.id !== id) })),

        clearMemories: () => set({ memories: [] }),

        importMemories: (incoming) =>
          set((s) => {
            const newOnes = incoming.filter(
              (im) =>
                !s.memories.some((m) => isSimilarMemory(m.content, im.content)),
            );
            return { memories: [...s.memories, ...newOnes] };
          }),

        isStreaming: false,
        setIsStreaming: (v) => set({ isStreaming: v }),

        performanceMode: false,
        setPerformanceMode: (v) => set({ performanceMode: v }),

        wormholeTarget: null,
        startWormhole: (id, color) => set({ wormholeTarget: { id, color } }),
        clearWormhole: () => set({ wormholeTarget: null }),
      };
    },
    {
      name: "starfield-app-state",
      version: 1,
      partialize: (s) => ({
        conversations: s.conversations
          .slice(0, 20)
          .map((c) => ({ ...c, messages: c.messages.slice(-50) })),
        activeConversationId: s.activeConversationId,
        memories: s.memories,
        hasDeepSeekKey: s.hasDeepSeekKey,
        hasTavilyKey: s.hasTavilyKey,
        performanceMode: s.performanceMode,
      }),
      migrate: (persisted, version) => {
        if (version === 1) {
          const state = persisted as Record<string, unknown>;
          // Migrate old flat messages array to conversations
          if (
            state &&
            "messages" in state &&
            Array.isArray(state.messages) &&
            !("conversations" in state)
          ) {
            const msgs = state.messages as ChatMessage[];
            const convo = makeConversation();
            convo.messages = msgs;
            if (msgs.length > 0) {
              const firstUser = msgs.find((m) => m.role === "user");
              if (firstUser)
                convo.title = firstUser.content.slice(
                  0,
                  MAX_CONVERSATION_TITLE_LENGTH,
                );
            }
            return {
              ...state,
              conversations: [convo],
              activeConversationId: convo.id,
              memories: [],
            };
          }
        }
        return persisted as Record<string, unknown>;
      },
    },
  ),
);
