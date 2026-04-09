import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export type AppView = "home" | "luna" | "settings";

interface AppState {
  // Navigation
  view: AppView;
  previousView: Exclude<AppView, "settings">;
  setView: (v: AppView) => void;
  goBack: () => void;

  // API keys (stored in OS keychain; these flags track presence)
  hasDeepSeekKey: boolean;
  setHasDeepSeekKey: (v: boolean) => void;
  hasTavilyKey: boolean;
  setHasTavilyKey: (v: boolean) => void;

  // Luna chat messages
  messages: ChatMessage[];
  addMessage: (m: ChatMessage) => void;
  updateLastAssistantMessage: (text: string) => void;
  clearMessages: () => void;

  // Streaming state
  isStreaming: boolean;
  setIsStreaming: (v: boolean) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      view: "home",
      previousView: "home",
      setView: (v) =>
        set((state) => {
          if (v === "settings") {
            return {
              view: v,
              previousView:
                state.view === "settings" ? state.previousView : (state.view as Exclude<AppView, "settings">),
            };
          }
          return { view: v, previousView: v };
        }),
      goBack: () =>
        set((state) => ({
          view: state.view === "settings" ? state.previousView : "home",
        })),

      hasDeepSeekKey: false,
      setHasDeepSeekKey: (v) => set({ hasDeepSeekKey: v }),
      hasTavilyKey: false,
      setHasTavilyKey: (v) => set({ hasTavilyKey: v }),

      messages: [],
      addMessage: (m) => set((s) => ({ messages: [...s.messages, m] })),
      updateLastAssistantMessage: (text) =>
        set((s) => {
          const msgs = [...s.messages];
          for (let i = msgs.length - 1; i >= 0; i--) {
            if (msgs[i].role === "assistant") {
              msgs[i] = { ...msgs[i], content: text };
              break;
            }
          }
          return { messages: msgs };
        }),
      clearMessages: () => set({ messages: [] }),

      isStreaming: false,
      setIsStreaming: (v) => set({ isStreaming: v }),
    }),
    {
      name: "starfield-app-state",
      version: 1,
      partialize: (s) => ({
        messages: s.messages.slice(-100),
        hasDeepSeekKey: s.hasDeepSeekKey,
        hasTavilyKey: s.hasTavilyKey,
      }),
    },
  ),
);
