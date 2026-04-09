import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface BeaconFileEntry {
  path: string;
  relativePath: string;
  size: number;
  isText: boolean;
  content?: string;
}

export interface BeaconProject {
  name: string;
  root: string;
  source: "local" | "github";
  githubUrl?: string;
  fileCount: number;
  indexedAt?: number;
  files: BeaconFileEntry[];
}

export interface BeaconChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

interface BeaconState {
  // Active project
  activeProject: BeaconProject | null;
  setActiveProject: (p: BeaconProject | null) => void;

  // Recent projects (persisted, without file contents)
  recentProjects: BeaconProject[];
  removeRecentProject: (root: string) => void;
  clearAllRecents: () => void;

  // Chat messages (per-project)
  messages: BeaconChatMessage[];
  savedMessages: Record<string, BeaconChatMessage[]>;
  addMessage: (m: BeaconChatMessage) => void;
  updateLastAssistantMessage: (text: string) => void;
  clearMessages: () => void;

  // UI state
  isIndexing: boolean;
  setIsIndexing: (v: boolean) => void;
  isStreaming: boolean;
  setIsStreaming: (v: boolean) => void;
  indexError: string | null;
  setIndexError: (e: string | null) => void;

  // GitHub import
  githubUrl: string;
  setGithubUrl: (url: string) => void;
}

export const useBeaconStore = create<BeaconState>()(
  persist(
    (set) => ({
      activeProject: null,
      setActiveProject: (p) =>
        set((s) => {
          const savedMessages = { ...s.savedMessages };
          if (s.activeProject && s.messages.length > 0) {
            savedMessages[s.activeProject.root] = s.messages.slice(-50);
          }
          if (!p)
            return {
              activeProject: null,
              messages: [],
              savedMessages,
            };
          const stripped: BeaconProject = { ...p, files: [] };
          const recent: BeaconProject[] = [
            stripped,
            ...s.recentProjects.filter((r) => r.root !== p.root),
          ].slice(0, 6);
          const messages = savedMessages[p.root] ?? [];
          return {
            activeProject: p,
            messages,
            recentProjects: recent,
            savedMessages,
          };
        }),

      recentProjects: [],
      removeRecentProject: (root) =>
        set((s) => ({
          recentProjects: s.recentProjects.filter((p) => p.root !== root),
        })),
      clearAllRecents: () => set({ recentProjects: [] }),

      messages: [],
      savedMessages: {},
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
      clearMessages: () =>
        set((s) => {
          const savedMessages = { ...s.savedMessages };
          if (s.activeProject) delete savedMessages[s.activeProject.root];
          return { messages: [], savedMessages };
        }),

      isIndexing: false,
      setIsIndexing: (v) => set({ isIndexing: v }),
      isStreaming: false,
      setIsStreaming: (v) => set({ isStreaming: v }),
      indexError: null,
      setIndexError: (e) => set({ indexError: e }),

      githubUrl: "",
      setGithubUrl: (url) => set({ githubUrl: url }),
    }),
    {
      name: "starfield-beacon-state",
      version: 1,
      partialize: (s) => ({
        recentProjects: s.recentProjects,
        savedMessages: s.savedMessages,
      }),
    },
  ),
);
