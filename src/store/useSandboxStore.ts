import { create } from "zustand";

// ── Types ────────────────────────────────────────────────────────────────────

export type SandboxItemType = "code" | "plan" | "chart";

export interface SandboxItem {
  id: string;
  type: SandboxItemType;
  title: string;
  content: string;
  /** Language hint for code items (e.g. "typescript", "python"). */
  language?: string;
  createdAt: number;
}

interface SandboxState {
  /** Whether the sandbox modal is currently open. */
  isOpen: boolean;
  /** The item currently displayed in the sandbox. */
  activeItem: SandboxItem | null;
  /** History of sandbox items produced during this session. */
  items: SandboxItem[];

  open: (item: SandboxItem) => void;
  close: () => void;
  /** Re-open a previously created item from history. */
  openById: (id: string) => void;
}

// ── Store ────────────────────────────────────────────────────────────────────

export const useSandboxStore = create<SandboxState>()((set, get) => ({
  isOpen: false,
  activeItem: null,
  items: [],

  open(item) {
    set((s) => ({
      isOpen: true,
      activeItem: item,
      items: [...s.items, item],
    }));
  },

  close() {
    set({ isOpen: false });
  },

  openById(id) {
    const found = get().items.find((i) => i.id === id);
    if (found) set({ isOpen: true, activeItem: found });
  },
}));
