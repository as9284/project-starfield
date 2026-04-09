import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Priority = "low" | "medium" | "high";

export interface OrbitTask {
  id: string;
  title: string;
  description: string | null;
  priority: Priority;
  due_date: string | null;
  completed: boolean;
  archived: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrbitNote {
  id: string;
  title: string;
  content: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateTaskData {
  title: string;
  description?: string | null;
  priority?: Priority;
  due_date?: string | null;
}

export interface CreateNoteData {
  title: string;
  content?: string | null;
}

interface OrbitState {
  tasks: OrbitTask[];
  notes: OrbitNote[];

  // Task operations
  createTask: (data: CreateTaskData) => string;
  updateTask: (id: string, updates: Partial<CreateTaskData>) => void;
  completeTask: (id: string) => void;
  uncompleteTask: (id: string) => void;
  archiveTask: (id: string) => void;
  unarchiveTask: (id: string) => void;
  deleteTask: (id: string) => void;

  // Note operations
  createNote: (data: CreateNoteData) => string;
  updateNote: (id: string, updates: Partial<CreateNoteData>) => void;
  deleteNote: (id: string) => void;
}

export const useOrbitStore = create<OrbitState>()(
  persist(
    (set) => ({
      tasks: [],
      notes: [],

      createTask: (data) => {
        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        const task: OrbitTask = {
          id,
          title: data.title.trim(),
          description: data.description?.trim() || null,
          priority: data.priority ?? "medium",
          due_date: data.due_date ?? null,
          completed: false,
          archived: false,
          archived_at: null,
          created_at: now,
          updated_at: now,
        };
        set((s) => ({ tasks: [task, ...s.tasks] }));
        return id;
      },

      updateTask: (id, updates) => {
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === id
              ? {
                  ...t,
                  ...(updates.title !== undefined && { title: updates.title.trim() }),
                  ...(updates.description !== undefined && {
                    description: updates.description?.trim() || null,
                  }),
                  ...(updates.priority !== undefined && { priority: updates.priority }),
                  ...(updates.due_date !== undefined && { due_date: updates.due_date }),
                  updated_at: new Date().toISOString(),
                }
              : t,
          ),
        }));
      },

      completeTask: (id) => {
        const archivedAt = new Date().toISOString();
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === id
              ? { ...t, completed: true, archived: true, archived_at: archivedAt, updated_at: archivedAt }
              : t,
          ),
        }));
      },

      uncompleteTask: (id) => {
        const now = new Date().toISOString();
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === id
              ? { ...t, completed: false, archived: false, archived_at: null, updated_at: now }
              : t,
          ),
        }));
      },

      archiveTask: (id) => {
        const archivedAt = new Date().toISOString();
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === id
              ? { ...t, archived: true, archived_at: archivedAt, updated_at: archivedAt }
              : t,
          ),
        }));
      },

      unarchiveTask: (id) => {
        const now = new Date().toISOString();
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === id
              ? { ...t, archived: false, archived_at: null, completed: false, updated_at: now }
              : t,
          ),
        }));
      },

      deleteTask: (id) => {
        set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) }));
      },

      createNote: (data) => {
        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        const note: OrbitNote = {
          id,
          title: data.title.trim(),
          content: data.content?.trim() || null,
          created_at: now,
          updated_at: now,
        };
        set((s) => ({ notes: [note, ...s.notes] }));
        return id;
      },

      updateNote: (id, updates) => {
        set((s) => ({
          notes: s.notes.map((n) =>
            n.id === id
              ? {
                  ...n,
                  ...(updates.title !== undefined && { title: updates.title.trim() }),
                  ...(updates.content !== undefined && {
                    content: updates.content?.trim() || null,
                  }),
                  updated_at: new Date().toISOString(),
                }
              : n,
          ),
        }));
      },

      deleteNote: (id) => {
        set((s) => ({ notes: s.notes.filter((n) => n.id !== id) }));
      },
    }),
    {
      name: "starfield-orbit-state",
      version: 1,
    },
  ),
);
