import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Priority = "low" | "medium" | "high";

export interface OrbitSubTask {
  id: string;
  title: string;
  completed: boolean;
  position: number;
}

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
  sub_tasks: OrbitSubTask[];
}

export interface OrbitNote {
  id: string;
  title: string;
  content: string | null;
  created_at: string;
  updated_at: string;
}

export const VALID_PROJECT_COLORS = ["violet", "purple", "blue", "cyan", "emerald", "amber", "rose", "pink"] as const;
export type ProjectColor = typeof VALID_PROJECT_COLORS[number];

export interface OrbitProject {
  id: string;
  name: string;
  description: string;
  color: string;
  deadline: string | null;
  taskIds: string[];
  noteIds: string[];
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

export interface CreateProjectData {
  name: string;
  description?: string;
  color?: string;
  deadline?: string | null;
  taskIds?: string[];
  noteIds?: string[];
}

interface OrbitState {
  tasks: OrbitTask[];
  notes: OrbitNote[];
  projects: OrbitProject[];

  // Task operations
  createTask: (data: CreateTaskData) => string;
  updateTask: (id: string, updates: Partial<CreateTaskData>) => void;
  completeTask: (id: string) => void;
  uncompleteTask: (id: string) => void;
  archiveTask: (id: string) => void;
  unarchiveTask: (id: string) => void;
  deleteTask: (id: string) => void;

  // Sub-task operations
  addSubTask: (taskId: string, title: string) => string;
  toggleSubTask: (taskId: string, subTaskId: string) => void;
  updateSubTask: (taskId: string, subTaskId: string, title: string) => void;
  deleteSubTask: (taskId: string, subTaskId: string) => void;

  // Note operations
  createNote: (data: CreateNoteData) => string;
  updateNote: (id: string, updates: Partial<CreateNoteData>) => void;
  deleteNote: (id: string) => void;

  // Project operations
  createProject: (data: CreateProjectData) => string;
  updateProject: (id: string, updates: Partial<CreateProjectData>) => void;
  deleteProject: (id: string) => void;
  linkTaskToProject: (projectId: string, taskId: string) => void;
  unlinkTaskFromProject: (projectId: string, taskId: string) => void;
  linkNoteToProject: (projectId: string, noteId: string) => void;
  unlinkNoteFromProject: (projectId: string, noteId: string) => void;
}

export const useOrbitStore = create<OrbitState>()(
  persist(
    (set) => ({
      tasks: [],
      notes: [],
      projects: [],

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
          sub_tasks: [],
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
        set((s) => ({
          tasks: s.tasks.filter((t) => t.id !== id),
          // Remove task from any projects it belongs to
          projects: s.projects.map((p) =>
            p.taskIds.includes(id)
              ? { ...p, taskIds: p.taskIds.filter((tid) => tid !== id), updated_at: new Date().toISOString() }
              : p,
          ),
        }));
      },

      addSubTask: (taskId, title) => {
        const subId = crypto.randomUUID();
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === taskId
              ? {
                  ...t,
                  sub_tasks: [
                    ...t.sub_tasks,
                    { id: subId, title: title.trim(), completed: false, position: t.sub_tasks.length },
                  ],
                  updated_at: new Date().toISOString(),
                }
              : t,
          ),
        }));
        return subId;
      },

      toggleSubTask: (taskId, subTaskId) => {
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === taskId
              ? {
                  ...t,
                  sub_tasks: t.sub_tasks.map((st) =>
                    st.id === subTaskId ? { ...st, completed: !st.completed } : st,
                  ),
                  updated_at: new Date().toISOString(),
                }
              : t,
          ),
        }));
      },

      updateSubTask: (taskId, subTaskId, title) => {
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === taskId
              ? {
                  ...t,
                  sub_tasks: t.sub_tasks.map((st) =>
                    st.id === subTaskId ? { ...st, title: title.trim() } : st,
                  ),
                  updated_at: new Date().toISOString(),
                }
              : t,
          ),
        }));
      },

      deleteSubTask: (taskId, subTaskId) => {
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === taskId
              ? {
                  ...t,
                  sub_tasks: t.sub_tasks
                    .filter((st) => st.id !== subTaskId)
                    .map((st, i) => ({ ...st, position: i })),
                  updated_at: new Date().toISOString(),
                }
              : t,
          ),
        }));
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
        set((s) => ({
          notes: s.notes.filter((n) => n.id !== id),
          // Remove note from any projects it belongs to
          projects: s.projects.map((p) =>
            p.noteIds.includes(id)
              ? { ...p, noteIds: p.noteIds.filter((nid) => nid !== id), updated_at: new Date().toISOString() }
              : p,
          ),
        }));
      },

      createProject: (data) => {
        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        const project: OrbitProject = {
          id,
          name: data.name.trim(),
          description: data.description?.trim() ?? "",
          color: data.color ?? "violet",
          deadline: data.deadline ?? null,
          taskIds: data.taskIds ?? [],
          noteIds: data.noteIds ?? [],
          created_at: now,
          updated_at: now,
        };
        set((s) => ({ projects: [project, ...s.projects] }));
        return id;
      },

      updateProject: (id, updates) => {
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === id
              ? {
                  ...p,
                  ...(updates.name !== undefined && { name: updates.name.trim() }),
                  ...(updates.description !== undefined && { description: updates.description.trim() }),
                  ...(updates.color !== undefined && { color: updates.color }),
                  ...(updates.deadline !== undefined && { deadline: updates.deadline }),
                  ...(updates.taskIds !== undefined && { taskIds: updates.taskIds }),
                  ...(updates.noteIds !== undefined && { noteIds: updates.noteIds }),
                  updated_at: new Date().toISOString(),
                }
              : p,
          ),
        }));
      },

      deleteProject: (id) => {
        set((s) => ({ projects: s.projects.filter((p) => p.id !== id) }));
      },

      linkTaskToProject: (projectId, taskId) => {
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === projectId && !p.taskIds.includes(taskId)
              ? { ...p, taskIds: [...p.taskIds, taskId], updated_at: new Date().toISOString() }
              : p,
          ),
        }));
      },

      unlinkTaskFromProject: (projectId, taskId) => {
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === projectId
              ? { ...p, taskIds: p.taskIds.filter((id) => id !== taskId), updated_at: new Date().toISOString() }
              : p,
          ),
        }));
      },

      linkNoteToProject: (projectId, noteId) => {
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === projectId && !p.noteIds.includes(noteId)
              ? { ...p, noteIds: [...p.noteIds, noteId], updated_at: new Date().toISOString() }
              : p,
          ),
        }));
      },

      unlinkNoteFromProject: (projectId, noteId) => {
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === projectId
              ? { ...p, noteIds: p.noteIds.filter((id) => id !== noteId), updated_at: new Date().toISOString() }
              : p,
          ),
        }));
      },
    }),
    {
      name: "starfield-orbit-state",
      version: 2,
      migrate(persistedState, version) {
        if (version < 2) {
          const old = persistedState as { tasks?: Array<OrbitTask & { sub_tasks?: OrbitSubTask[] }>; notes?: OrbitNote[] };
          // Add sub_tasks array to all existing tasks and initialize projects array
          return {
            ...old,
            tasks: (old.tasks ?? []).map((t) => ({
              ...t,
              sub_tasks: t.sub_tasks ?? [],
            })),
            projects: [],
          };
        }
        return persistedState as OrbitState;
      },
    },
  ),
);
