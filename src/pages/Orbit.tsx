import { useState, useEffect, useRef, useCallback } from "react";
import {
  ListTodo,
  ArrowLeft,
  Plus,
  CheckCircle2,
  Circle,
  Archive,
  Pencil,
  Trash2,
  X,
  StickyNote,
  Calendar,
  ChevronDown,
  RotateCcw,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import StarField from "../components/StarField";
import { useAppStore } from "../store/useAppStore";
import { useOrbitStore } from "../store/useOrbitStore";
import type { OrbitTask, OrbitNote, Priority } from "../store/useOrbitStore";

type Tab = "tasks" | "notes";
type TaskFilter = "active" | "archived";

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDueDate(due: string): { label: string; overdue: boolean; today: boolean } {
  const d = new Date(due);
  const now = new Date();
  const todayStr = now.toDateString();
  const tomorrowStr = new Date(now.getTime() + 86400000).toDateString();
  const dStr = d.toDateString();

  if (dStr === todayStr) return { label: "Today", overdue: false, today: true };
  if (dStr === tomorrowStr) return { label: "Tomorrow", overdue: false, today: false };
  if (d < now && dStr !== todayStr) {
    return { label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }), overdue: true, today: false };
  }
  return { label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }), overdue: false, today: false };
}

const PRIORITY_STYLES: Record<Priority, { dot: string; label: string; text: string; border: string }> = {
  low: { dot: "bg-blue-400/70", label: "text-blue-300/60", text: "Low", border: "border-l-blue-500/40" },
  medium: { dot: "bg-amber-400/80", label: "text-amber-300/60", text: "Medium", border: "border-l-amber-500/40" },
  high: { dot: "bg-rose-400", label: "text-rose-300/65", text: "High", border: "border-l-rose-500/50" },
};

// ── Task Card ────────────────────────────────────────────────────────────────

interface TaskCardProps {
  task: OrbitTask;
  onToggle: (id: string) => void;
  onArchive: (id: string) => void;
  onUnarchive: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (task: OrbitTask) => void;
}

function TaskCard({ task, onToggle, onArchive, onUnarchive, onDelete, onEdit }: TaskCardProps) {
  const p = PRIORITY_STYLES[task.priority];
  const due = task.due_date ? formatDueDate(task.due_date) : null;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.18 }}
      className={`group flex items-start gap-3 px-4 py-3 rounded-xl border-l-2 transition-all duration-200 ${p.border} ${
        task.completed || task.archived
          ? "opacity-50"
          : "hover:-translate-y-px"
      }`}
      style={{
        background: "rgba(16, 15, 46, 0.55)",
        border: "1px solid rgba(37, 34, 96, 0.7)",
        borderLeftWidth: "2px",
        borderLeftColor: task.priority === "high" ? "rgba(251, 113, 133, 0.5)" :
          task.priority === "medium" ? "rgba(251, 191, 36, 0.4)" : "rgba(96, 165, 250, 0.4)",
      }}
    >
      {/* Checkbox */}
      <button
        onClick={() => onToggle(task.id)}
        className="shrink-0 mt-0.5 transition-all duration-200"
        style={{ color: task.completed ? "rgba(52, 211, 153, 0.6)" : "rgba(155, 120, 248, 0.3)" }}
        title={task.completed ? "Mark active" : "Mark complete"}
      >
        {task.completed ? <CheckCircle2 size={17} /> : <Circle size={17} />}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onEdit(task)}>
        <p
          className="text-sm font-medium leading-snug"
          style={{
            color: task.completed ? "rgba(237, 233, 254, 0.3)" : "var(--color-text-primary)",
            textDecoration: task.completed ? "line-through" : "none",
          }}
        >
          {task.title}
        </p>
        {task.description && (
          <p className="mt-0.5 text-xs line-clamp-1" style={{ color: "var(--color-text-muted)" }}>
            {task.description}
          </p>
        )}
        <div className="flex items-center gap-3 mt-1.5">
          <span className={`flex items-center gap-1.5 text-[11px] ${p.label}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${p.dot}`} />
            {p.text}
          </span>
          {due && (
            <span
              className="flex items-center gap-1 text-[11px]"
              style={{
                color: due.overdue ? "rgba(248, 113, 113, 0.8)" :
                  due.today ? "rgba(251, 191, 36, 0.8)" : "rgba(155, 120, 248, 0.4)",
              }}
            >
              <Calendar size={10} />
              {due.label}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        {!task.archived && (
          <button
            onClick={() => onEdit(task)}
            className="p-1.5 rounded-lg transition-all duration-150"
            style={{ color: "var(--color-text-muted)" }}
            title="Edit"
          >
            <Pencil size={12} />
          </button>
        )}
        {task.archived ? (
          <button
            onClick={() => onUnarchive(task.id)}
            className="p-1.5 rounded-lg transition-all duration-150"
            style={{ color: "var(--color-text-muted)" }}
            title="Restore"
          >
            <RotateCcw size={12} />
          </button>
        ) : (
          <button
            onClick={() => onArchive(task.id)}
            className="p-1.5 rounded-lg transition-all duration-150"
            style={{ color: "var(--color-text-muted)" }}
            title="Archive"
          >
            <Archive size={12} />
          </button>
        )}
        <button
          onClick={() => onDelete(task.id)}
          className="p-1.5 rounded-lg transition-all duration-150"
          style={{ color: "var(--color-text-muted)" }}
          title="Delete"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </motion.div>
  );
}

// ── Note Card ────────────────────────────────────────────────────────────────

interface NoteCardProps {
  note: OrbitNote;
  onEdit: (note: OrbitNote) => void;
  onDelete: (id: string) => void;
}

function NoteCard({ note, onEdit, onDelete }: NoteCardProps) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.18 }}
      className="group relative rounded-xl p-4 cursor-pointer transition-all duration-200 hover:-translate-y-px"
      style={{
        background: "rgba(16, 15, 46, 0.55)",
        border: "1px solid rgba(37, 34, 96, 0.7)",
      }}
      onClick={() => onEdit(note)}
    >
      <p className="text-sm font-medium mb-1.5" style={{ color: "var(--color-text-primary)" }}>
        {note.title}
      </p>
      {note.content && (
        <p className="text-xs line-clamp-2 leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
          {note.content}
        </p>
      )}
      <p className="text-[10px] mt-2" style={{ color: "var(--color-text-dim)" }}>
        {new Date(note.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
      </p>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(note.id); }}
        className="absolute top-3 right-3 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-150"
        style={{ color: "var(--color-text-muted)" }}
        title="Delete"
      >
        <Trash2 size={12} />
      </button>
    </motion.div>
  );
}

// ── Task Modal ───────────────────────────────────────────────────────────────

interface TaskModalProps {
  task?: OrbitTask | null;
  onSave: (data: { title: string; description: string; priority: Priority; due_date: string | null }) => void;
  onClose: () => void;
}

function TaskModal({ task, onSave, onClose }: TaskModalProps) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [priority, setPriority] = useState<Priority>(task?.priority ?? "medium");
  const [dueDate, setDueDate] = useState(task?.due_date?.slice(0, 10) ?? "");
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSave({
      title: title.trim(),
      description: description.trim(),
      priority,
      due_date: dueDate || null,
    });
  };

  const handleBackdrop = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(6, 6, 14, 0.75)" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={handleBackdrop}
    >
      <motion.div
        className="glass rounded-2xl w-full max-w-md p-5"
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
            {task ? "Edit task" : "New task"}
          </h3>
          <button onClick={onClose} style={{ color: "var(--color-text-muted)" }}>
            <X size={15} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            ref={titleRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Task title…"
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={{
              background: "rgba(13, 12, 34, 0.8)",
              border: "1px solid var(--color-border-dim)",
              color: "var(--color-text-primary)",
            }}
          />

          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)…"
            rows={3}
            className="w-full px-3 py-2 rounded-lg text-sm resize-none outline-none"
            style={{
              background: "rgba(13, 12, 34, 0.8)",
              border: "1px solid var(--color-border-dim)",
              color: "var(--color-text-primary)",
            }}
          />

          <div className="flex gap-2">
            {/* Priority */}
            <div className="flex-1">
              <label className="block text-[11px] mb-1" style={{ color: "var(--color-text-muted)" }}>Priority</label>
              <div className="flex gap-1">
                {(["low", "medium", "high"] as Priority[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriority(p)}
                    className="flex-1 py-1.5 rounded-lg text-xs font-medium capitalize transition-all duration-150"
                    style={{
                      background: priority === p ? "rgba(124, 79, 240, 0.25)" : "rgba(13, 12, 34, 0.6)",
                      border: priority === p ? "1px solid rgba(124, 79, 240, 0.4)" : "1px solid var(--color-border-dim)",
                      color: priority === p ? "var(--color-purple-300)" : "var(--color-text-muted)",
                    }}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Due date */}
            <div className="flex-1">
              <label className="block text-[11px] mb-1" style={{ color: "var(--color-text-muted)" }}>Due date</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-2 py-1.5 rounded-lg text-xs outline-none"
                style={{
                  background: "rgba(13, 12, 34, 0.8)",
                  border: "1px solid var(--color-border-dim)",
                  color: dueDate ? "var(--color-text-primary)" : "var(--color-text-muted)",
                  colorScheme: "dark",
                }}
              />
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 rounded-lg text-sm transition-all duration-150"
              style={{
                background: "rgba(13, 12, 34, 0.6)",
                border: "1px solid var(--color-border-dim)",
                color: "var(--color-text-muted)",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim()}
              className="flex-1 py-2 rounded-lg text-sm font-medium transition-all duration-150 disabled:opacity-40"
              style={{
                background: "rgba(124, 79, 240, 0.3)",
                border: "1px solid rgba(124, 79, 240, 0.4)",
                color: "var(--color-purple-200)",
              }}
            >
              {task ? "Save" : "Create"}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

// ── Note Modal ───────────────────────────────────────────────────────────────

interface NoteModalProps {
  note?: OrbitNote | null;
  onSave: (data: { title: string; content: string }) => void;
  onClose: () => void;
}

function NoteModal({ note, onSave, onClose }: NoteModalProps) {
  const [title, setTitle] = useState(note?.title ?? "");
  const [content, setContent] = useState(note?.content ?? "");
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSave({ title: title.trim(), content: content.trim() });
  };

  const handleBackdrop = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(6, 6, 14, 0.75)" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={handleBackdrop}
    >
      <motion.div
        className="glass rounded-2xl w-full max-w-md p-5"
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
            {note ? "Edit note" : "New note"}
          </h3>
          <button onClick={onClose} style={{ color: "var(--color-text-muted)" }}>
            <X size={15} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            ref={titleRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Note title…"
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={{
              background: "rgba(13, 12, 34, 0.8)",
              border: "1px solid var(--color-border-dim)",
              color: "var(--color-text-primary)",
            }}
          />

          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Write something…"
            rows={6}
            className="w-full px-3 py-2 rounded-lg text-sm resize-none outline-none"
            style={{
              background: "rgba(13, 12, 34, 0.8)",
              border: "1px solid var(--color-border-dim)",
              color: "var(--color-text-primary)",
            }}
          />

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 rounded-lg text-sm transition-all duration-150"
              style={{
                background: "rgba(13, 12, 34, 0.6)",
                border: "1px solid var(--color-border-dim)",
                color: "var(--color-text-muted)",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim()}
              className="flex-1 py-2 rounded-lg text-sm font-medium transition-all duration-150 disabled:opacity-40"
              style={{
                background: "rgba(124, 79, 240, 0.3)",
                border: "1px solid rgba(124, 79, 240, 0.4)",
                color: "var(--color-purple-200)",
              }}
            >
              {note ? "Save" : "Create"}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

// ── Main Orbit Page ──────────────────────────────────────────────────────────

export default function Orbit() {
  const { setView } = useAppStore();
  const {
    tasks,
    notes,
    createTask,
    updateTask,
    completeTask,
    uncompleteTask,
    archiveTask,
    unarchiveTask,
    deleteTask,
    createNote,
    updateNote,
    deleteNote,
  } = useOrbitStore();

  const [tab, setTab] = useState<Tab>("tasks");
  const [taskFilter, setTaskFilter] = useState<TaskFilter>("active");
  const [taskModal, setTaskModal] = useState<OrbitTask | null | "new">(null);
  const [noteModal, setNoteModal] = useState<OrbitNote | null | "new">(null);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [sort, setSort] = useState<"recent" | "priority" | "due">("recent");
  const sortRef = useRef<HTMLDivElement>(null);

  // Keyboard shortcut: N to create
  const openCreate = useCallback(() => {
    if (tab === "tasks") setTaskModal("new");
    else setNoteModal("new");
  }, [tab]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.key === "n" && !e.ctrlKey && !e.metaKey && !e.altKey &&
        taskModal === null && noteModal === null
      ) {
        const tag = (e.target as HTMLElement).tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        e.preventDefault();
        openCreate();
      }
      if (e.key === "Escape") {
        setTaskModal(null);
        setNoteModal(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [openCreate, taskModal, noteModal]);

  // Close sort menu on outside click
  useEffect(() => {
    if (!showSortMenu) return;
    const handler = (e: MouseEvent) => {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setShowSortMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showSortMenu]);

  // Computed task list
  const activeTasks = tasks.filter((t) => !t.archived);
  const archivedTasks = tasks.filter((t) => t.archived);

  const displayedTasks = (() => {
    let list = taskFilter === "active" ? activeTasks : archivedTasks;
    if (sort === "priority") {
      const order: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
      list = [...list].sort((a, b) => order[a.priority] - order[b.priority]);
    } else if (sort === "due") {
      list = [...list].sort((a, b) => {
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return a.due_date.localeCompare(b.due_date);
      });
    }
    return list;
  })();

  const overdueCount = activeTasks.filter((t) => {
    if (!t.due_date) return false;
    const d = new Date(t.due_date);
    const now = new Date();
    return d < now && d.toDateString() !== now.toDateString();
  }).length;

  const handleToggle = (id: string) => {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    if (task.completed) uncompleteTask(id);
    else completeTask(id);
  };

  const handleSaveTask = (data: { title: string; description: string; priority: Priority; due_date: string | null }) => {
    if (taskModal === "new") {
      createTask(data);
    } else if (taskModal) {
      updateTask(taskModal.id, data);
    }
    setTaskModal(null);
  };

  const handleSaveNote = (data: { title: string; content: string }) => {
    if (noteModal === "new") {
      createNote(data);
    } else if (noteModal) {
      updateNote(noteModal.id, data);
    }
    setNoteModal(null);
  };

  const SORT_LABELS = { recent: "Recent", priority: "Priority", due: "Due date" };

  return (
    <div className="flex-1 flex flex-col min-h-0 relative overflow-hidden">
      <StarField />

      <div className="above-stars flex-1 flex flex-col min-h-0">
        {/* Header */}
        <div
          className="flex items-center gap-3 px-5 py-3 shrink-0"
          style={{ borderBottom: "1px solid var(--color-border-dim)" }}
        >
          <button
            className="win-btn"
            onClick={() => setView("luna")}
            title="Back to Luna"
          >
            <ArrowLeft size={14} />
          </button>
          <ListTodo size={16} style={{ color: "var(--color-purple-400)" }} />
          <span className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
            Orbit
          </span>
          <span
            className="text-xs px-2 py-0.5 rounded"
            style={{ background: "rgba(124, 79, 240, 0.12)", color: "var(--color-text-muted)" }}
          >
            constellation
          </span>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* Tab + Action bar */}
          <div
            className="flex items-center justify-between px-5 py-3 shrink-0"
            style={{ borderBottom: "1px solid rgba(37, 34, 96, 0.5)" }}
          >
            <div className="flex items-center gap-1">
              {(["tasks", "notes"] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all duration-200"
                  style={{
                    background: tab === t ? "rgba(124, 79, 240, 0.2)" : "transparent",
                    border: tab === t ? "1px solid rgba(124, 79, 240, 0.3)" : "1px solid transparent",
                    color: tab === t ? "var(--color-purple-300)" : "var(--color-text-muted)",
                  }}
                >
                  {t === "tasks" ? <ListTodo size={12} /> : <StickyNote size={12} />}
                  {t}
                </button>
              ))}
            </div>

            <button
              onClick={openCreate}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150"
              style={{
                background: "rgba(124, 79, 240, 0.2)",
                border: "1px solid rgba(124, 79, 240, 0.35)",
                color: "var(--color-purple-300)",
              }}
              title="New (N)"
            >
              <Plus size={12} strokeWidth={2.5} />
              New
              <kbd className="text-[9px] opacity-50 ml-0.5">N</kbd>
            </button>
          </div>

          {/* Tasks view */}
          {tab === "tasks" && (
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              {/* Stats + filter bar */}
              <div className="flex items-center justify-between px-5 py-2.5 shrink-0">
                <div className="flex items-center gap-1">
                  {(["active", "archived"] as TaskFilter[]).map((f) => (
                    <button
                      key={f}
                      onClick={() => setTaskFilter(f)}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-medium capitalize transition-all duration-150"
                      style={{
                        background: taskFilter === f ? "rgba(124, 79, 240, 0.15)" : "transparent",
                        color: taskFilter === f ? "var(--color-purple-300)" : "var(--color-text-muted)",
                      }}
                    >
                      {f}
                      <span className="ml-1.5 opacity-60">
                        {f === "active" ? activeTasks.length : archivedTasks.length}
                      </span>
                    </button>
                  ))}
                  {overdueCount > 0 && taskFilter === "active" && (
                    <span
                      className="ml-1 text-[10px] px-1.5 py-0.5 rounded"
                      style={{ background: "rgba(248, 113, 113, 0.15)", color: "rgba(248, 113, 113, 0.8)" }}
                    >
                      {overdueCount} overdue
                    </span>
                  )}
                </div>

                {/* Sort */}
                <div ref={sortRef} className="relative">
                  <button
                    onClick={() => setShowSortMenu((v) => !v)}
                    className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg transition-colors"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    {SORT_LABELS[sort]}
                    <ChevronDown size={10} className={showSortMenu ? "rotate-180" : ""} style={{ transition: "transform 0.15s" }} />
                  </button>
                  {showSortMenu && (
                    <div
                      className="absolute right-0 top-full mt-1 rounded-xl overflow-hidden z-50 shadow-xl"
                      style={{
                        background: "rgba(13, 12, 34, 0.95)",
                        border: "1px solid var(--color-border-dim)",
                        minWidth: 100,
                      }}
                    >
                      {(["recent", "priority", "due"] as const).map((s) => (
                        <button
                          key={s}
                          onClick={() => { setSort(s); setShowSortMenu(false); }}
                          className="w-full text-left px-3 py-2 text-xs transition-colors"
                          style={{
                            color: sort === s ? "var(--color-purple-300)" : "var(--color-text-muted)",
                            background: sort === s ? "rgba(124, 79, 240, 0.1)" : "transparent",
                          }}
                        >
                          {SORT_LABELS[s]}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Task list */}
              <div className="flex-1 overflow-y-auto px-5 pb-4">
                {displayedTasks.length === 0 ? (
                  <div
                    className="flex flex-col items-center justify-center h-full gap-3 py-16"
                    style={{ color: "var(--color-text-dim)" }}
                  >
                    <ListTodo size={28} style={{ opacity: 0.3 }} />
                    <p className="text-sm">
                      {taskFilter === "active" ? "No active tasks — press N to add one" : "No archived tasks"}
                    </p>
                  </div>
                ) : (
                  <AnimatePresence mode="popLayout">
                    <div className="flex flex-col gap-2 pt-1">
                      {displayedTasks.map((task) => (
                        <TaskCard
                          key={task.id}
                          task={task}
                          onToggle={handleToggle}
                          onArchive={archiveTask}
                          onUnarchive={unarchiveTask}
                          onDelete={deleteTask}
                          onEdit={(t) => setTaskModal(t)}
                        />
                      ))}
                    </div>
                  </AnimatePresence>
                )}
              </div>
            </div>
          )}

          {/* Notes view */}
          {tab === "notes" && (
            <div className="flex-1 overflow-y-auto px-5 pb-4">
              {notes.length === 0 ? (
                <div
                  className="flex flex-col items-center justify-center h-full gap-3 py-16"
                  style={{ color: "var(--color-text-dim)" }}
                >
                  <StickyNote size={28} style={{ opacity: 0.3 }} />
                  <p className="text-sm">No notes yet — press N to create one</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <AnimatePresence mode="popLayout">
                    {notes.map((note) => (
                      <NoteCard
                        key={note.id}
                        note={note}
                        onEdit={(n) => setNoteModal(n)}
                        onDelete={deleteNote}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {taskModal !== null && (
          <TaskModal
            task={taskModal === "new" ? null : taskModal}
            onSave={handleSaveTask}
            onClose={() => setTaskModal(null)}
          />
        )}
        {noteModal !== null && (
          <NoteModal
            note={noteModal === "new" ? null : noteModal}
            onSave={handleSaveNote}
            onClose={() => setNoteModal(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
