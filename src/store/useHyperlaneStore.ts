import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface HyperlaneEntry {
  id: string;
  original: string;
  short: string;
  createdAt: number;
}

interface HyperlaneState {
  history: HyperlaneEntry[];
  addEntry: (entry: HyperlaneEntry) => void;
  clearHistory: () => void;
  findCached: (original: string) => string | null;
}

const MAX_ENTRIES = 30;

export const useHyperlaneStore = create<HyperlaneState>()(
  persist(
    (set, get) => ({
      history: [],

      addEntry: (entry) =>
        set((s) => {
          const deduped = s.history.filter(
            (e) => e.original !== entry.original,
          );
          return { history: [entry, ...deduped].slice(0, MAX_ENTRIES) };
        }),

      clearHistory: () => set({ history: [] }),

      findCached: (original) => {
        const entry = get().history.find((e) => e.original === original);
        return entry?.short ?? null;
      },
    }),
    {
      name: "starfield-hyperlane",
      version: 1,
    },
  ),
);
