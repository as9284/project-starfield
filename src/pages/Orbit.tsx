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
  FolderOpen,
  CheckSquare,
  Square,
  PenLine,
  Copy,
  Check,
  ArrowRight,
  Eraser,
  Loader2,
  Sparkles,
  Play,
  History,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import StarField from "../components/StarField";
import { useAppStore } from "../store/useAppStore";
import { useOrbitStore } from "../store/useOrbitStore";
import { useOrbitMeetingStore } from "../store/useOrbitMeetingStore";
import type { OrbitTask, OrbitNote, OrbitSubTask, OrbitProject, Priority } from "../store/useOrbitStore";
import type { MeetingSession } from "../store/useOrbitMeetingStore";
import { WRITING_MODES, processWriting, generateMeetingArtifacts, generateMeetingAgenda } from "../lib/orbit-ai";
import type { WritingMode } from "../lib/orbit-ai";

type Tab = "tasks" | "notes" | "projects" | "writing" | "meeting";
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
  low: { dot: "bg-blue-400/80", label: "text-blue-300/90", text: "Low", border: "border-l-blue-500/50" },
  medium: { dot: "bg-amber-400/90", label: "text-amber-300/90", text: "Medium", border: "border-l-amber-500/60" },
  high: { dot: "bg-rose-400", label: "text-rose-300/90", text: "High", border: "border-l-rose-500/70" },
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
  const subTasks = task.sub_tasks ?? [];
  const completedSubTasks = subTasks.filter((s) => s.completed).length;

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
        style={{ color: task.completed ? "rgba(52, 211, 153, 0.8)" : "rgba(155, 120, 248, 0.6)" }}
        title={task.completed ? "Mark active" : "Mark complete"}
      >
        {task.completed ? <CheckCircle2 size={18} /> : <Circle size={18} />}
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
        {subTasks.length > 0 && (
          <div className="mt-1.5 flex items-center gap-2">
            <div
              className="flex-1 h-1 rounded-full overflow-hidden"
              style={{ background: "rgba(37, 34, 96, 0.8)" }}
            >
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${subTasks.length > 0 ? (completedSubTasks / subTasks.length) * 100 : 0}%`,
                  background: completedSubTasks === subTasks.length
                    ? "rgba(52, 211, 153, 0.7)"
                    : "rgba(124, 79, 240, 0.6)",
                }}
              />
            </div>
            <span className="text-[11px] tabular-nums shrink-0" style={{ color: "var(--color-text-secondary)" }}>
              {completedSubTasks}/{subTasks.length}
            </span>
          </div>
        )}
        <div className="flex items-center gap-3 mt-1.5">
          <span className={`flex items-center gap-1.5 text-xs ${p.label}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${p.dot}`} />
            {p.text}
          </span>
          {due && (
            <span
              className="flex items-center gap-1 text-xs"
              style={{
                color: due.overdue ? "rgba(248, 113, 113, 0.9)" :
                  due.today ? "rgba(251, 191, 36, 0.9)" : "rgba(196, 184, 240, 0.7)",
              }}
            >
              <Calendar size={11} />
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
            style={{ color: "var(--color-text-secondary)" }}
            title="Edit"
          >
            <Pencil size={14} />
          </button>
        )}
        {task.archived ? (
          <button
            onClick={() => onUnarchive(task.id)}
            className="p-1.5 rounded-lg transition-all duration-150"
            style={{ color: "var(--color-text-secondary)" }}
            title="Restore"
          >
            <RotateCcw size={14} />
          </button>
        ) : (
          <button
            onClick={() => onArchive(task.id)}
            className="p-1.5 rounded-lg transition-all duration-150"
            style={{ color: "var(--color-text-secondary)" }}
            title="Archive"
          >
            <Archive size={14} />
          </button>
        )}
        <button
          onClick={() => onDelete(task.id)}
          className="p-1.5 rounded-lg transition-all duration-150"
          style={{ color: "var(--color-text-secondary)" }}
          title="Delete"
        >
          <Trash2 size={14} />
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
      <p className="text-[11px] mt-2" style={{ color: "var(--color-text-secondary)" }}>
        {new Date(note.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
      </p>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(note.id); }}
        className="absolute top-3 right-3 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-150"
        style={{ color: "var(--color-text-secondary)" }}
        title="Delete"
      >
        <Trash2 size={14} />
      </button>
    </motion.div>
  );
}

// ── Task Modal ───────────────────────────────────────────────────────────────

interface TaskModalProps {
  task?: OrbitTask | null;
  onSave: (data: { title: string; description: string; priority: Priority; due_date: string | null; subTasks: OrbitSubTask[] }) => void;
  onClose: () => void;
}

function TaskModal({ task, onSave, onClose }: TaskModalProps) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [priority, setPriority] = useState<Priority>(task?.priority ?? "medium");
  const [dueDate, setDueDate] = useState(task?.due_date?.slice(0, 10) ?? "");
  const [subTasks, setSubTasks] = useState<OrbitSubTask[]>(task?.sub_tasks ?? []);
  const [newSubTask, setNewSubTask] = useState("");
  const titleRef = useRef<HTMLInputElement>(null);
  const newSubTaskRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const handleAddSubTask = () => {
    const trimmed = newSubTask.trim();
    if (!trimmed) return;
    setSubTasks((prev) => [
      ...prev,
      { id: crypto.randomUUID(), title: trimmed, completed: false, position: prev.length },
    ]);
    setNewSubTask("");
    newSubTaskRef.current?.focus();
  };

  const handleSubTaskKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddSubTask();
    }
  };

  const toggleSubTask = (id: string) => {
    setSubTasks((prev) =>
      prev.map((st) => (st.id === id ? { ...st, completed: !st.completed } : st)),
    );
  };

  const deleteSubTaskLocal = (id: string) => {
    setSubTasks((prev) => prev.filter((st) => st.id !== id).map((st, i) => ({ ...st, position: i })));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    // Add any pending sub-task input
    const finalSubTasks = newSubTask.trim()
      ? [...subTasks, { id: crypto.randomUUID(), title: newSubTask.trim(), completed: false, position: subTasks.length }]
      : subTasks;
    onSave({
      title: title.trim(),
      description: description.trim(),
      priority,
      due_date: dueDate || null,
      subTasks: finalSubTasks,
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
        className="glass rounded-2xl w-full max-w-md p-5 max-h-[85vh] overflow-y-auto"
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
              <label className="block text-xs mb-1" style={{ color: "var(--color-text-secondary)" }}>Priority</label>
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
              <label className="block text-xs mb-1" style={{ color: "var(--color-text-secondary)" }}>Due date</label>
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

          {/* Sub-tasks */}
          <div>
            <label className="block text-xs mb-1.5" style={{ color: "var(--color-text-secondary)" }}>
              Sub-tasks
            </label>
            {subTasks.length > 0 && (
              <div className="flex flex-col gap-1 mb-1.5">
                {subTasks.map((st) => (
                  <div key={st.id} className="flex items-center gap-2 group">
                    <button
                      type="button"
                      onClick={() => toggleSubTask(st.id)}
                      className="shrink-0 transition-colors"
                      style={{ color: st.completed ? "rgba(52, 211, 153, 0.8)" : "rgba(155, 120, 248, 0.5)" }}
                    >
                      {st.completed ? <CheckSquare size={14} /> : <Square size={14} />}
                    </button>
                    <span
                      className="flex-1 text-xs"
                      style={{
                        color: st.completed ? "var(--color-text-secondary)" : "var(--color-text-primary)",
                        textDecoration: st.completed ? "line-through" : "none",
                        opacity: st.completed ? 0.6 : 1,
                      }}
                    >
                      {st.title}
                    </span>
                    <button
                      type="button"
                      onClick={() => deleteSubTaskLocal(st.id)}
                      className="opacity-0 group-hover:opacity-100 shrink-0 transition-opacity"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              <input
                ref={newSubTaskRef}
                value={newSubTask}
                onChange={(e) => setNewSubTask(e.target.value)}
                onKeyDown={handleSubTaskKeyDown}
                placeholder="Add sub-task…"
                className="flex-1 px-2.5 py-1.5 rounded-lg text-xs outline-none"
                style={{
                  background: "rgba(13, 12, 34, 0.8)",
                  border: "1px solid var(--color-border-dim)",
                  color: "var(--color-text-primary)",
                }}
              />
              <button
                type="button"
                onClick={handleAddSubTask}
                disabled={!newSubTask.trim()}
                className="p-1.5 rounded-lg transition-all disabled:opacity-30"
                style={{
                  background: "rgba(124, 79, 240, 0.2)",
                  border: "1px solid rgba(124, 79, 240, 0.3)",
                  color: "var(--color-purple-300)",
                }}
              >
                <Plus size={12} strokeWidth={2.5} />
              </button>
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

// ── Project helpers ──────────────────────────────────────────────────────────

const PROJECT_COLORS = [
  { name: "violet", bg: "rgba(139, 92, 246, 0.7)", border: "rgba(139, 92, 246, 0.35)" },
  { name: "purple", bg: "rgba(168, 85, 247, 0.7)", border: "rgba(168, 85, 247, 0.35)" },
  { name: "blue", bg: "rgba(59, 130, 246, 0.7)", border: "rgba(59, 130, 246, 0.35)" },
  { name: "cyan", bg: "rgba(6, 182, 212, 0.7)", border: "rgba(6, 182, 212, 0.35)" },
  { name: "emerald", bg: "rgba(16, 185, 129, 0.7)", border: "rgba(16, 185, 129, 0.35)" },
  { name: "amber", bg: "rgba(245, 158, 11, 0.7)", border: "rgba(245, 158, 11, 0.35)" },
  { name: "rose", bg: "rgba(244, 63, 94, 0.7)", border: "rgba(244, 63, 94, 0.35)" },
  { name: "pink", bg: "rgba(236, 72, 153, 0.7)", border: "rgba(236, 72, 153, 0.35)" },
];

function getProjectColorStyle(color: string) {
  return PROJECT_COLORS.find((c) => c.name === color) ?? PROJECT_COLORS[0];
}

// ── Project Card ─────────────────────────────────────────────────────────────

interface ProjectCardProps {
  project: OrbitProject;
  taskCount: number;
  completedTaskCount: number;
  noteCount: number;
  onEdit: (p: OrbitProject) => void;
  onDelete: (id: string) => void;
  onClick: (p: OrbitProject) => void;
}

function ProjectCard({ project, taskCount, completedTaskCount, noteCount, onEdit, onDelete, onClick }: ProjectCardProps) {
  const colorStyle = getProjectColorStyle(project.color);
  const progress = taskCount > 0 ? (completedTaskCount / taskCount) * 100 : 0;
  const due = project.deadline ? formatDueDate(project.deadline) : null;

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
        border: `1px solid ${colorStyle.border}`,
      }}
      onClick={() => onClick(project)}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: colorStyle.bg }} />
          <p className="text-sm font-semibold truncate" style={{ color: "var(--color-text-primary)" }}>
            {project.name}
          </p>
        </div>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(project); }}
            className="p-1.5 rounded-lg transition-all duration-150"
            style={{ color: "var(--color-text-secondary)" }}
            title="Edit"
          >
            <Pencil size={13} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(project.id); }}
            className="p-1.5 rounded-lg transition-all duration-150"
            style={{ color: "var(--color-text-secondary)" }}
            title="Delete"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {project.description && (
        <p className="text-xs mb-2.5 line-clamp-2" style={{ color: "var(--color-text-muted)" }}>
          {project.description}
        </p>
      )}

      {taskCount > 0 && (
        <div className="mb-2.5">
          <div className="h-1 rounded-full overflow-hidden mb-1" style={{ background: "rgba(37, 34, 96, 0.8)" }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${progress}%`,
                background: progress === 100 ? "rgba(52, 211, 153, 0.7)" : colorStyle.bg,
              }}
            />
          </div>
          <p className="text-[11px] tabular-nums" style={{ color: "var(--color-text-secondary)" }}>
            {completedTaskCount}/{taskCount} tasks · {Math.round(progress)}%
          </p>
        </div>
      )}

      <div className="flex items-center gap-3">
        {due && (
          <span
            className="flex items-center gap-1 text-[11px]"
            style={{
              color: due.overdue ? "rgba(248, 113, 113, 0.9)" :
                due.today ? "rgba(251, 191, 36, 0.9)" : "rgba(196, 184, 240, 0.7)",
            }}
          >
            <Calendar size={10} />
            {due.label}
          </span>
        )}
        <span className="flex items-center gap-1 text-[11px]" style={{ color: "var(--color-text-secondary)" }}>
          <ListTodo size={10} />
          {taskCount}
        </span>
        <span className="flex items-center gap-1 text-[11px]" style={{ color: "var(--color-text-secondary)" }}>
          <StickyNote size={10} />
          {noteCount}
        </span>
      </div>
    </motion.div>
  );
}

// ── Project Modal ─────────────────────────────────────────────────────────────

interface ProjectModalProps {
  project?: OrbitProject | null;
  onSave: (data: { name: string; description: string; color: string; deadline: string | null }) => void;
  onClose: () => void;
}

function ProjectModal({ project, onSave, onClose }: ProjectModalProps) {
  const [name, setName] = useState(project?.name ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [color, setColor] = useState(project?.color ?? "violet");
  const [deadline, setDeadline] = useState(project?.deadline?.slice(0, 10) ?? "");
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({ name: name.trim(), description: description.trim(), color, deadline: deadline || null });
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
            {project ? "Edit project" : "New project"}
          </h3>
          <button onClick={onClose} style={{ color: "var(--color-text-muted)" }}>
            <X size={15} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            ref={nameRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Project name…"
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
            rows={2}
            className="w-full px-3 py-2 rounded-lg text-sm resize-none outline-none"
            style={{
              background: "rgba(13, 12, 34, 0.8)",
              border: "1px solid var(--color-border-dim)",
              color: "var(--color-text-primary)",
            }}
          />

          <div className="flex gap-2">
            {/* Color picker */}
            <div className="flex-1">
              <label className="block text-xs mb-1" style={{ color: "var(--color-text-secondary)" }}>Color</label>
              <div className="flex flex-wrap gap-1.5">
                {PROJECT_COLORS.map((c) => (
                  <button
                    key={c.name}
                    type="button"
                    onClick={() => setColor(c.name)}
                    className="w-5 h-5 rounded-full transition-all duration-150"
                    style={{
                      background: c.bg,
                      boxShadow: color === c.name ? `0 0 0 2px rgba(255,255,255,0.5)` : "none",
                    }}
                    title={c.name}
                  />
                ))}
              </div>
            </div>

            {/* Deadline */}
            <div className="flex-1">
              <label className="block text-xs mb-1" style={{ color: "var(--color-text-secondary)" }}>Deadline</label>
              <input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="w-full px-2 py-1.5 rounded-lg text-xs outline-none"
                style={{
                  background: "rgba(13, 12, 34, 0.8)",
                  border: "1px solid var(--color-border-dim)",
                  color: deadline ? "var(--color-text-primary)" : "var(--color-text-muted)",
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
              disabled={!name.trim()}
              className="flex-1 py-2 rounded-lg text-sm font-medium transition-all duration-150 disabled:opacity-40"
              style={{
                background: "rgba(124, 79, 240, 0.3)",
                border: "1px solid rgba(124, 79, 240, 0.4)",
                color: "var(--color-purple-200)",
              }}
            >
              {project ? "Save" : "Create"}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

// ── Project Detail Modal ──────────────────────────────────────────────────────

interface ProjectDetailModalProps {
  project: OrbitProject | null;
  allTasks: OrbitTask[];
  allNotes: OrbitNote[];
  onClose: () => void;
  onLinkTask: (projectId: string, taskId: string) => void;
  onUnlinkTask: (projectId: string, taskId: string) => void;
  onLinkNote: (projectId: string, noteId: string) => void;
  onUnlinkNote: (projectId: string, noteId: string) => void;
}

function ProjectDetailModal({
  project,
  allTasks,
  allNotes,
  onClose,
  onLinkTask,
  onUnlinkTask,
  onLinkNote,
  onUnlinkNote,
}: ProjectDetailModalProps) {
  if (!project) return null;

  const colorStyle = getProjectColorStyle(project.color);
  const linkedTasks = allTasks.filter((t) => project.taskIds.includes(t.id) && !t.archived);
  const linkedNotes = allNotes.filter((n) => project.noteIds.includes(n.id));
  const unlinkable = allTasks.filter((t) => !project.taskIds.includes(t.id) && !t.archived);
  const unlinkableNotes = allNotes.filter((n) => !project.noteIds.includes(n.id));
  const [addTaskOpen, setAddTaskOpen] = useState(false);
  const [addNoteOpen, setAddNoteOpen] = useState(false);

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
        className="glass rounded-2xl w-full max-w-lg p-5 max-h-[80vh] overflow-y-auto"
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full shrink-0" style={{ background: colorStyle.bg }} />
            <h3 className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
              {project.name}
            </h3>
          </div>
          <button onClick={onClose} style={{ color: "var(--color-text-muted)" }}>
            <X size={15} />
          </button>
        </div>

        {project.description && (
          <p className="text-xs mb-4 leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
            {project.description}
          </p>
        )}

        {/* Tasks */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold" style={{ color: "var(--color-text-secondary)" }}>
              Tasks ({linkedTasks.length})
            </span>
            {unlinkable.length > 0 && (
              <button
                onClick={() => setAddTaskOpen((v) => !v)}
                className="text-xs flex items-center gap-1 transition-colors"
                style={{ color: "var(--color-purple-300)" }}
              >
                <Plus size={11} strokeWidth={2.5} />
                Add
              </button>
            )}
          </div>
          {addTaskOpen && (
            <div
              className="mb-2 rounded-xl overflow-hidden"
              style={{ border: "1px solid var(--color-border-dim)", background: "rgba(13, 12, 34, 0.8)" }}
            >
              {unlinkable.map((t) => (
                <button
                  key={t.id}
                  onClick={() => { onLinkTask(project.id, t.id); setAddTaskOpen(false); }}
                  className="w-full text-left px-3 py-2 text-xs transition-colors hover:bg-white/5"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  {t.title}
                </button>
              ))}
            </div>
          )}
          {linkedTasks.length === 0 ? (
            <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>No tasks linked yet.</p>
          ) : (
            <div className="flex flex-col gap-1">
              {linkedTasks.map((t) => (
                <div key={t.id} className="flex items-center gap-2 group">
                  {t.completed
                    ? <CheckCircle2 size={14} style={{ color: "rgba(52, 211, 153, 0.8)", flexShrink: 0 }} />
                    : <Circle size={14} style={{ color: "rgba(155, 120, 248, 0.5)", flexShrink: 0 }} />
                  }
                  <span
                    className="flex-1 text-xs"
                    style={{
                      color: "var(--color-text-primary)",
                      textDecoration: t.completed ? "line-through" : "none",
                      opacity: t.completed ? 0.5 : 1,
                    }}
                  >
                    {t.title}
                  </span>
                  <button
                    onClick={() => onUnlinkTask(project.id, t.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5"
                    style={{ color: "var(--color-text-muted)" }}
                    title="Remove from project"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Notes */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold" style={{ color: "var(--color-text-secondary)" }}>
              Notes ({linkedNotes.length})
            </span>
            {unlinkableNotes.length > 0 && (
              <button
                onClick={() => setAddNoteOpen((v) => !v)}
                className="text-xs flex items-center gap-1 transition-colors"
                style={{ color: "var(--color-purple-300)" }}
              >
                <Plus size={11} strokeWidth={2.5} />
                Add
              </button>
            )}
          </div>
          {addNoteOpen && (
            <div
              className="mb-2 rounded-xl overflow-hidden"
              style={{ border: "1px solid var(--color-border-dim)", background: "rgba(13, 12, 34, 0.8)" }}
            >
              {unlinkableNotes.map((n) => (
                <button
                  key={n.id}
                  onClick={() => { onLinkNote(project.id, n.id); setAddNoteOpen(false); }}
                  className="w-full text-left px-3 py-2 text-xs transition-colors hover:bg-white/5"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  {n.title}
                </button>
              ))}
            </div>
          )}
          {linkedNotes.length === 0 ? (
            <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>No notes linked yet.</p>
          ) : (
            <div className="flex flex-col gap-1">
              {linkedNotes.map((n) => (
                <div key={n.id} className="flex items-center gap-2 group">
                  <StickyNote size={13} style={{ color: "rgba(155, 120, 248, 0.5)", flexShrink: 0 }} />
                  <span className="flex-1 text-xs" style={{ color: "var(--color-text-primary)" }}>{n.title}</span>
                  <button
                    onClick={() => onUnlinkNote(project.id, n.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5"
                    style={{ color: "var(--color-text-muted)" }}
                    title="Remove from project"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Writing Assistant View ────────────────────────────────────────────────────

function WritingAssistantView() {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [activeMode, setActiveMode] = useState<WritingMode>("improve");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleProcess = useCallback(async () => {
    if (!input.trim() || loading) return;
    setLoading(true);
    setOutput("");
    try {
      const result = await processWriting(input, activeMode);
      if (result.text) setOutput(result.text);
      else setOutput(`Error: ${result.error ?? "Could not process text"}`);
    } finally {
      setLoading(false);
    }
  }, [input, activeMode, loading]);

  const handleCopy = useCallback(async () => {
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  }, [output]);

  const handleUseOutput = useCallback(() => {
    if (!output) return;
    setInput(output);
    setOutput("");
  }, [output]);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Mode selector */}
      <div
        className="px-5 pt-3 pb-2 shrink-0"
        style={{ borderBottom: "1px solid rgba(37, 34, 96, 0.3)" }}
      >
        <p
          className="text-[10px] font-semibold uppercase tracking-widest mb-2"
          style={{ color: "var(--color-text-secondary)", opacity: 0.5 }}
        >
          Mode
        </p>
        <div className="flex flex-wrap gap-1.5">
          {WRITING_MODES.map(({ mode, label, description }) => (
            <button
              key={mode}
              title={description}
              onClick={() => setActiveMode(mode)}
              className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all duration-150"
              style={{
                background: activeMode === mode ? "rgba(124, 79, 240, 0.18)" : "rgba(255,255,255,0.03)",
                border: activeMode === mode ? "1px solid rgba(124, 79, 240, 0.3)" : "1px solid rgba(255,255,255,0.07)",
                color: activeMode === mode ? "var(--color-purple-300)" : "var(--color-text-secondary)",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Two-column layout */}
      <div className="flex-1 flex min-h-0">
        {/* Input column */}
        <div
          className="flex-1 flex flex-col min-h-0 p-4 gap-3"
          style={{ borderRight: "1px solid rgba(37, 34, 96, 0.3)" }}
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Paste or type your text here…"
            className="flex-1 min-h-0 w-full resize-none rounded-xl px-4 py-3 text-sm leading-relaxed focus:outline-none transition-all duration-200"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "var(--color-text-primary)",
            }}
          />
          <div className="flex items-center gap-2">
            <button
              onClick={handleProcess}
              disabled={loading || !input.trim()}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: "linear-gradient(to right, rgba(124, 79, 240, 0.8), rgba(59, 130, 246, 0.8))",
                color: "#fff",
              }}
            >
              {loading ? (
                <><Loader2 size={15} className="animate-spin" /> Processing…</>
              ) : (
                <>{WRITING_MODES.find((m) => m.mode === activeMode)?.label} <ArrowRight size={14} /></>
              )}
            </button>
            {input.trim() && (
              <button
                onClick={() => { setInput(""); setOutput(""); }}
                className="flex items-center gap-1.5 text-[11px] px-3 py-2.5 rounded-xl transition-colors"
                style={{ color: "var(--color-text-secondary)" }}
              >
                <Eraser size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Output column */}
        <div className="flex-1 flex flex-col min-h-0">
          <div
            className="flex items-center justify-between px-4 pt-3 pb-2 shrink-0"
            style={{ borderBottom: "1px solid rgba(37, 34, 96, 0.3)" }}
          >
            <p
              className="text-[10px] font-semibold uppercase tracking-widest"
              style={{ color: "var(--color-text-secondary)", opacity: 0.5 }}
            >
              Result
            </p>
            {output && (
              <div className="flex items-center gap-1">
                <button
                  onClick={handleUseOutput}
                  title="Move result back to input"
                  className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg transition-colors"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  <ArrowRight size={11} className="rotate-180" />
                  Use as input
                </button>
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg transition-colors"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  {copied ? <Check size={11} style={{ color: "var(--color-nebula-teal)" }} /> : <Copy size={11} />}
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
            )}
          </div>
          <div className="flex-1 min-h-0 p-4">
            {output ? (
              <textarea
                readOnly
                value={output}
                className="h-full w-full resize-none rounded-xl px-4 py-3 text-sm leading-relaxed focus:outline-none"
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  color: "var(--color-text-primary)",
                }}
              />
            ) : (
              <div
                className="h-full flex flex-col items-center justify-center gap-3 text-center"
                style={{ color: "var(--color-text-secondary)" }}
              >
                {loading ? (
                  <>
                    <Loader2 size={22} className="animate-spin" style={{ color: "var(--color-purple-400)", opacity: 0.6 }} />
                    <p className="text-xs" style={{ opacity: 0.5 }}>Processing…</p>
                  </>
                ) : (
                  <>
                    <PenLine size={28} style={{ opacity: 0.2 }} />
                    <p className="text-xs" style={{ opacity: 0.5 }}>
                      Your result will appear here
                    </p>
                    <p className="text-[11px]" style={{ opacity: 0.3 }}>
                      Enter text, choose a mode, and tap the button
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Meeting Mode View ────────────────────────────────────────────────────────

function MeetingModeView({
  createTask,
  addSubTask,
  createNote,
}: {
  createTask: (data: { title: string; description?: string | null; priority?: Priority; due_date?: string | null }) => string;
  addSubTask: (taskId: string, title: string) => string;
  createNote: (data: { title: string; content?: string | null }) => string;
}) {
  const {
    activeSession,
    sessions,
    startSession,
    addEntry,
    endSession,
    deleteSession,
    discardActiveSession,
  } = useOrbitMeetingStore();

  const [meetingTitle, setMeetingTitle] = useState("");
  const [noteInput, setNoteInput] = useState("");
  const [ending, setEnding] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [selectedSession, setSelectedSession] = useState<MeetingSession | null>(null);

  const notesEndRef = useRef<HTMLDivElement>(null);
  const noteInputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to newest note
  useEffect(() => {
    notesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeSession?.entries.length]);

  // Focus textarea when session becomes active
  useEffect(() => {
    if (activeSession) noteInputRef.current?.focus();
  }, [activeSession]);

  const handleStartMeeting = useCallback(async () => {
    if (activeSession || !meetingTitle.trim()) return;
    const created = startSession(meetingTitle);
    if (!created) return;
    setMeetingTitle("");
    setSelectedSession(null);

    // Generate agenda as first entry (best-effort)
    try {
      const agendaResult = await generateMeetingAgenda(meetingTitle);
      if (agendaResult.agenda) {
        addEntry(`📋 Suggested Agenda\n\n${agendaResult.agenda}`);
      }
    } catch { /* ignore */ }
  }, [activeSession, meetingTitle, startSession, addEntry]);

  const handleAddEntry = useCallback(() => {
    if (!activeSession || !noteInput.trim()) return;
    addEntry(noteInput);
    setNoteInput("");
    requestAnimationFrame(() => noteInputRef.current?.focus());
  }, [activeSession, noteInput, addEntry]);

  const handleEntryKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleAddEntry();
      }
    },
    [handleAddEntry],
  );

  const handleEndMeeting = useCallback(async () => {
    if (!activeSession || activeSession.entries.length === 0) return;
    setEnding(true);

    try {
      const result = await generateMeetingArtifacts(
        activeSession.title,
        activeSession.entries.map((e) => e.content),
      );

      if (!result.artifacts) {
        setEnding(false);
        return;
      }

      // Create a note and task in Orbit from the meeting artifacts
      createNote({
        title: result.artifacts.note.title,
        content: result.artifacts.note.content,
      });

      const taskId = createTask({
        title: result.artifacts.task.title,
        description: result.artifacts.task.description || undefined,
        priority: result.artifacts.task.priority,
      });

      for (const subTitle of result.artifacts.task.subTasks) {
        addSubTask(taskId, subTitle);
      }

      endSession({
        createdAt: new Date().toISOString(),
        warning: result.error,
        note: result.artifacts.note,
        task: {
          ...result.artifacts.task,
        },
      });

      setSelectedSession(null);
    } finally {
      setEnding(false);
    }
  }, [activeSession, createNote, createTask, addSubTask, endSession]);

  const handleDiscard = useCallback(() => {
    discardActiveSession();
    setNoteInput("");
  }, [discardActiveSession]);

  // Meeting History Modal
  if (showHistory) {
    const viewSession = selectedSession ?? (sessions.length > 0 ? sessions[0] : null);
    return (
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <div
          className="flex items-center justify-between px-5 py-3 shrink-0"
          style={{ borderBottom: "1px solid rgba(37, 34, 96, 0.3)" }}
        >
          <div className="flex items-center gap-2">
            <History size={14} style={{ color: "var(--color-purple-400)" }} />
            <span className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
              Meeting History
            </span>
            <span className="text-xs" style={{ color: "var(--color-text-secondary)", opacity: 0.5 }}>
              {sessions.length} session{sessions.length !== 1 ? "s" : ""}
            </span>
          </div>
          <button
            onClick={() => setShowHistory(false)}
            className="win-btn"
          >
            <X size={14} />
          </button>
        </div>

        {sessions.length === 0 ? (
          <div
            className="flex-1 flex flex-col items-center justify-center gap-3"
            style={{ color: "var(--color-text-secondary)" }}
          >
            <History size={28} style={{ opacity: 0.2 }} />
            <p className="text-sm" style={{ opacity: 0.5 }}>No completed sessions yet</p>
          </div>
        ) : (
          <div className="flex-1 flex min-h-0">
            {/* Session list sidebar */}
            <div
              className="w-52 shrink-0 overflow-y-auto p-2"
              style={{ borderRight: "1px solid rgba(37, 34, 96, 0.3)" }}
            >
              {sessions.map((s) => {
                const isSelected = viewSession?.id === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => setSelectedSession(s)}
                    className="flex w-full items-center rounded-xl px-3 py-2.5 text-left text-sm transition-all duration-200 mb-1"
                    style={{
                      background: isSelected ? "rgba(124, 79, 240, 0.12)" : "transparent",
                      border: isSelected ? "1px solid rgba(124, 79, 240, 0.2)" : "1px solid transparent",
                      color: isSelected ? "var(--color-purple-300)" : "var(--color-text-secondary)",
                    }}
                  >
                    <span className="truncate font-medium text-xs">{s.title}</span>
                  </button>
                );
              })}
            </div>

            {/* Session detail */}
            <div className="flex-1 overflow-y-auto p-5">
              {viewSession ? (
                <div>
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div>
                      <p className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
                        {viewSession.title}
                      </p>
                      <p className="text-[11px] mt-1" style={{ color: "var(--color-text-secondary)", opacity: 0.5 }}>
                        {viewSession.endedAt
                          ? new Date(viewSession.endedAt).toLocaleString()
                          : new Date(viewSession.startedAt).toLocaleString()}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        deleteSession(viewSession.id);
                        setSelectedSession(null);
                      }}
                      className="p-1.5 rounded-lg transition-colors"
                      style={{ color: "var(--color-text-secondary)" }}
                      title="Delete session"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>

                  {/* Artifact badges */}
                  <div className="flex flex-wrap gap-2 mb-4">
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px]"
                      style={{
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        color: "var(--color-text-secondary)",
                      }}
                    >
                      <StickyNote size={10} />
                      {viewSession.entries.length} note{viewSession.entries.length !== 1 ? "s" : ""}
                    </span>
                    {viewSession.artifacts?.note.title && (
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] max-w-52"
                        style={{
                          background: "rgba(124, 79, 240, 0.08)",
                          border: "1px solid rgba(124, 79, 240, 0.18)",
                          color: "var(--color-purple-300)",
                        }}
                      >
                        <StickyNote size={10} className="shrink-0" />
                        <span className="truncate">{viewSession.artifacts.note.title}</span>
                      </span>
                    )}
                    {viewSession.artifacts?.task.title && (
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] max-w-52"
                        style={{
                          background: "rgba(59, 130, 246, 0.08)",
                          border: "1px solid rgba(59, 130, 246, 0.18)",
                          color: "var(--color-sky-300)",
                        }}
                      >
                        <ListTodo size={10} className="shrink-0" />
                        <span className="truncate">{viewSession.artifacts.task.title}</span>
                      </span>
                    )}
                  </div>

                  {/* Entry preview */}
                  {viewSession.entries.length > 0 && (
                    <div className="space-y-2.5">
                      {viewSession.entries.map((entry, i) => (
                        <div key={entry.id} className="flex gap-2.5">
                          <div
                            className="mt-0.5 shrink-0 h-4 w-4 rounded-full flex items-center justify-center text-[9px] font-medium"
                            style={{
                              background: "rgba(255,255,255,0.04)",
                              border: "1px solid rgba(255,255,255,0.07)",
                              color: "var(--color-text-secondary)",
                              opacity: 0.5,
                            }}
                          >
                            {i + 1}
                          </div>
                          <p
                            className="text-xs leading-relaxed whitespace-pre-wrap flex-1"
                            style={{ color: "var(--color-text-secondary)", opacity: 0.7 }}
                          >
                            {entry.content}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div
                  className="flex items-center justify-center h-full text-sm"
                  style={{ color: "var(--color-text-secondary)", opacity: 0.5 }}
                >
                  Select a meeting to review
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Active session view
  if (activeSession) {
    return (
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Active session sub-header */}
        <div
          className="flex items-center gap-3 px-5 py-2.5 shrink-0"
          style={{ borderBottom: "1px solid rgba(37, 34, 96, 0.3)" }}
        >
          <span className="relative flex h-2 w-2 shrink-0">
            <span
              className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60"
              style={{ background: "var(--color-nebula-teal)" }}
            />
            <span
              className="relative inline-flex h-2 w-2 rounded-full"
              style={{ background: "var(--color-nebula-teal)" }}
            />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate" style={{ color: "var(--color-text-primary)" }}>
              {activeSession.title}
            </p>
          </div>
          <span className="text-[11px]" style={{ color: "var(--color-text-secondary)", opacity: 0.5 }}>
            {activeSession.entries.length} note{activeSession.entries.length !== 1 ? "s" : ""}
          </span>
          <button
            onClick={handleDiscard}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all duration-200"
            style={{ color: "var(--color-text-secondary)" }}
          >
            <X size={12} />
            Discard
          </button>
        </div>

        {/* Notes list */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {activeSession.entries.length === 0 ? (
            <div
              className="h-full flex flex-col items-center justify-center gap-3"
              style={{ color: "var(--color-text-secondary)" }}
            >
              <StickyNote size={28} style={{ opacity: 0.2 }} />
              <p className="text-sm" style={{ opacity: 0.5 }}>No notes yet</p>
              <p className="text-xs" style={{ opacity: 0.3 }}>
                Type a note below and press Enter — one per key point
              </p>
            </div>
          ) : (
            <div className="max-w-2xl mx-auto space-y-3">
              {activeSession.entries.map((entry, i) => (
                <motion.div
                  key={entry.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex gap-3"
                >
                  <div
                    className="mt-1 shrink-0 h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-medium"
                    style={{
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      color: "var(--color-text-secondary)",
                      opacity: 0.5,
                    }}
                  >
                    {i + 1}
                  </div>
                  <div
                    className="flex-1 min-w-0 rounded-2xl rounded-tl-md px-4 py-2.5"
                    style={{
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.07)",
                    }}
                  >
                    <p
                      className="text-sm leading-relaxed whitespace-pre-wrap"
                      style={{ color: "var(--color-text-primary)", opacity: 0.85 }}
                    >
                      {entry.content}
                    </p>
                    <p className="mt-1.5 text-[10px]" style={{ color: "var(--color-text-secondary)", opacity: 0.3 }}>
                      {new Date(entry.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </motion.div>
              ))}
              <div ref={notesEndRef} />
            </div>
          )}
        </div>

        {/* Input bar */}
        <div
          className="shrink-0 px-5 py-3"
          style={{ borderTop: "1px solid rgba(37, 34, 96, 0.3)" }}
        >
          <div className="max-w-2xl mx-auto flex items-end gap-2">
            <textarea
              ref={noteInputRef}
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              onKeyDown={handleEntryKeyDown}
              rows={1}
              placeholder="Type a note and press Enter…"
              className="flex-1 resize-none rounded-xl px-4 py-3 text-sm focus:outline-none transition-colors duration-200"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "var(--color-text-primary)",
                minHeight: 48,
                maxHeight: 144,
              }}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = `${Math.min(el.scrollHeight, 144)}px`;
              }}
            />
            <button
              onClick={handleAddEntry}
              disabled={!noteInput.trim()}
              className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-3 rounded-xl text-xs font-semibold transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "var(--color-text-secondary)",
              }}
            >
              <Plus size={14} />
            </button>
            <button
              onClick={() => void handleEndMeeting()}
              disabled={ending || activeSession.entries.length === 0}
              className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-3 rounded-xl text-xs font-semibold transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: "linear-gradient(to right, rgba(124, 79, 240, 0.8), rgba(59, 130, 246, 0.8))",
                color: "#fff",
              }}
            >
              {ending ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Square size={12} fill="currentColor" />
              )}
              <span>{ending ? "Generating…" : "End & save"}</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Idle — start a meeting
  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6"
          style={{
            background: "rgba(124, 79, 240, 0.1)",
            border: "1px solid rgba(124, 79, 240, 0.15)",
          }}
        >
          <Play size={28} style={{ color: "var(--color-purple-400)", opacity: 0.6, transform: "translateX(2px)" }} />
        </div>
        <h2 className="text-lg font-bold mb-2" style={{ color: "var(--color-text-primary)", opacity: 0.8 }}>
          Start a meeting
        </h2>
        <p className="text-sm max-w-sm leading-relaxed mb-7" style={{ color: "var(--color-text-secondary)", opacity: 0.5 }}>
          Jot one note per point as the conversation unfolds. Luna will write a summary note and create a follow-up task when you end.
        </p>
        <div className="w-full max-w-xs space-y-3">
          <input
            type="text"
            value={meetingTitle}
            onChange={(e) => setMeetingTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void handleStartMeeting(); }}
            placeholder="Meeting title"
            className="w-full rounded-xl px-4 py-2.5 text-sm text-center focus:outline-none transition-colors duration-200"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "var(--color-text-primary)",
            }}
          />
          <button
            onClick={() => void handleStartMeeting()}
            disabled={!meetingTitle.trim()}
            className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl text-sm font-semibold transition-all duration-200 disabled:opacity-45 disabled:cursor-not-allowed"
            style={{
              background: "linear-gradient(to right, rgba(124, 79, 240, 0.8), rgba(59, 130, 246, 0.8))",
              color: "#fff",
            }}
          >
            <Play size={15} style={{ transform: "translateX(2px)" }} />
            Start meeting
          </button>
          {sessions.length > 0 && (
            <button
              onClick={() => { setShowHistory(true); setSelectedSession(null); }}
              className="w-full flex items-center justify-center gap-1.5 text-[11px] font-medium py-2 transition-colors"
              style={{ color: "var(--color-text-secondary)", opacity: 0.5 }}
            >
              <History size={12} />
              View history ({sessions.length})
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Orbit Page ──────────────────────────────────────────────────────────

export default function Orbit() {
  const { goBack } = useAppStore();
  const {
    tasks,
    notes,
    projects,
    createTask,
    updateTask,
    completeTask,
    uncompleteTask,
    archiveTask,
    unarchiveTask,
    deleteTask,
    addSubTask,
    toggleSubTask,
    updateSubTask,
    deleteSubTask,
    createNote,
    updateNote,
    deleteNote,
    createProject,
    updateProject,
    deleteProject,
    linkTaskToProject,
    unlinkTaskFromProject,
    linkNoteToProject,
    unlinkNoteFromProject,
  } = useOrbitStore();

  const [tab, setTab] = useState<Tab>("tasks");
  const [taskFilter, setTaskFilter] = useState<TaskFilter>("active");
  const [taskModal, setTaskModal] = useState<OrbitTask | null | "new">(null);
  const [noteModal, setNoteModal] = useState<OrbitNote | null | "new">(null);
  const [projectModal, setProjectModal] = useState<OrbitProject | null | "new">(null);
  const [detailProject, setDetailProject] = useState<OrbitProject | null>(null);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [sort, setSort] = useState<"recent" | "priority" | "due">("recent");
  const sortRef = useRef<HTMLDivElement>(null);

  // Keep detailProject in sync with store when projects change.
  // We read the detailProject ID via a ref to avoid a dependency on detailProject
  // itself, which would create an infinite update loop.
  const detailProjectIdRef = useRef<string | null>(null);
  detailProjectIdRef.current = detailProject?.id ?? null;

  useEffect(() => {
    const currentId = detailProjectIdRef.current;
    if (!currentId) return;
    const updated = projects.find((p) => p.id === currentId);
    if (updated) setDetailProject(updated);
    else setDetailProject(null);
  }, [projects]);

  // Keyboard shortcut: N to create (only for tasks/notes/projects tabs)
  const openCreate = useCallback(() => {
    if (tab === "tasks") setTaskModal("new");
    else if (tab === "notes") setNoteModal("new");
    else if (tab === "projects") setProjectModal("new");
  }, [tab]);

  const showNewButton = tab === "tasks" || tab === "notes" || tab === "projects";

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.key === "n" && !e.ctrlKey && !e.metaKey && !e.altKey &&
        taskModal === null && noteModal === null && projectModal === null
      ) {
        const tag = (e.target as HTMLElement).tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        e.preventDefault();
        openCreate();
      }
      if (e.key === "Escape") {
        setTaskModal(null);
        setNoteModal(null);
        setProjectModal(null);
        setDetailProject(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [openCreate, taskModal, noteModal, projectModal]);

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

  const handleSaveTask = (data: { title: string; description: string; priority: Priority; due_date: string | null; subTasks: OrbitSubTask[] }) => {
    if (taskModal === "new") {
      const taskId = createTask(data);
      for (const st of data.subTasks) {
        addSubTask(taskId, st.title);
      }
    } else if (taskModal) {
      const existingTask = tasks.find((t) => t.id === taskModal.id);
      updateTask(taskModal.id, data);
      // Reconcile sub-tasks: remove deleted ones, add new ones, toggle changed ones
      if (existingTask) {
        const existingIds = new Set(existingTask.sub_tasks.map((s) => s.id));
        const newIds = new Set(data.subTasks.map((s) => s.id));
        // Delete removed sub-tasks
        for (const st of existingTask.sub_tasks) {
          if (!newIds.has(st.id)) deleteSubTask(taskModal.id, st.id);
        }
        // Add new sub-tasks and sync existing ones
        for (const st of data.subTasks) {
          if (!existingIds.has(st.id)) {
            const newId = addSubTask(taskModal.id, st.title);
            if (st.completed) toggleSubTask(taskModal.id, newId);
          } else {
            // Update title if changed
            const orig = existingTask.sub_tasks.find((s) => s.id === st.id);
            if (orig && orig.title !== st.title) updateSubTask(taskModal.id, st.id, st.title);
            if (orig && orig.completed !== st.completed) toggleSubTask(taskModal.id, st.id);
          }
        }
      }
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

  const handleSaveProject = (data: { name: string; description: string; color: string; deadline: string | null }) => {
    if (projectModal === "new") {
      createProject(data);
    } else if (projectModal) {
      updateProject(projectModal.id, data);
    }
    setProjectModal(null);
  };

  // Project enrichment: compute completed task count for each project
  const enrichedProjects = projects.map((p) => {
    const linkedTasks = tasks.filter((t) => p.taskIds.includes(t.id) && !t.archived);
    const completedCount = linkedTasks.filter((t) => t.completed).length;
    return { project: p, taskCount: linkedTasks.length, completedTaskCount: completedCount, noteCount: p.noteIds.length };
  });

  const SORT_LABELS = { recent: "Recent", priority: "Priority", due: "Due date" };

  const TAB_ICONS: Record<Tab, React.ReactNode> = {
    tasks: <ListTodo size={12} />,
    notes: <StickyNote size={12} />,
    projects: <FolderOpen size={12} />,
    writing: <PenLine size={12} />,
    meeting: <Sparkles size={12} />,
  };

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
            onClick={goBack}
            title="Back (Esc)"
          >
            <ArrowLeft size={14} />
          </button>
          <ListTodo size={16} style={{ color: "var(--color-purple-400)" }} />
          <span className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
            Orbit
          </span>
          <span
            className="text-xs px-2 py-0.5 rounded"
            style={{ background: "rgba(124, 79, 240, 0.12)", color: "var(--color-purple-300)" }}
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
              {(["tasks", "notes", "projects", "writing", "meeting"] as Tab[]).map((t) => (
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
                  {TAB_ICONS[t]}
                  {t}
                </button>
              ))}
            </div>

            {showNewButton && (
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
                <Plus size={13} strokeWidth={2.5} />
                New
                <kbd className="text-[10px] opacity-60 ml-0.5">N</kbd>
              </button>
            )}
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
                      className="px-2.5 py-1 rounded-lg text-xs font-medium capitalize transition-all duration-150"
                      style={{
                        background: taskFilter === f ? "rgba(124, 79, 240, 0.15)" : "transparent",
                        color: taskFilter === f ? "var(--color-purple-300)" : "var(--color-text-secondary)",
                      }}
                    >
                      {f}
                      <span className="ml-1.5 opacity-70">
                        {f === "active" ? activeTasks.length : archivedTasks.length}
                      </span>
                    </button>
                  ))}
                  {overdueCount > 0 && taskFilter === "active" && (
                    <span
                      className="ml-1 text-xs px-1.5 py-0.5 rounded"
                      style={{ background: "rgba(248, 113, 113, 0.15)", color: "rgba(248, 113, 113, 0.9)" }}
                    >
                      {overdueCount} overdue
                    </span>
                  )}
                </div>

                {/* Sort */}
                <div ref={sortRef} className="relative">
                  <button
                    onClick={() => setShowSortMenu((v) => !v)}
                    className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-colors"
                    style={{ color: "var(--color-text-secondary)" }}
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
                            color: sort === s ? "var(--color-purple-300)" : "var(--color-text-secondary)",
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
                    style={{ color: "var(--color-text-secondary)" }}
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
                  style={{ color: "var(--color-text-secondary)" }}
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

          {/* Projects view */}
          {tab === "projects" && (
            <div className="flex-1 overflow-y-auto px-5 pb-4">
              {projects.length === 0 ? (
                <div
                  className="flex flex-col items-center justify-center h-full gap-3 py-16"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  <FolderOpen size={28} style={{ opacity: 0.3 }} />
                  <p className="text-sm">No projects yet — press N to create one</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <AnimatePresence mode="popLayout">
                    {enrichedProjects.map(({ project, taskCount, completedTaskCount, noteCount }) => (
                      <ProjectCard
                        key={project.id}
                        project={project}
                        taskCount={taskCount}
                        completedTaskCount={completedTaskCount}
                        noteCount={noteCount}
                        onEdit={(p) => setProjectModal(p)}
                        onDelete={deleteProject}
                        onClick={(p) => setDetailProject(p)}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>
          )}

          {/* Writing Assistant view */}
          {tab === "writing" && <WritingAssistantView />}

          {/* Meeting Mode view */}
          {tab === "meeting" && (
            <MeetingModeView
              createTask={createTask}
              addSubTask={addSubTask}
              createNote={createNote}
            />
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
        {projectModal !== null && (
          <ProjectModal
            project={projectModal === "new" ? null : projectModal}
            onSave={handleSaveProject}
            onClose={() => setProjectModal(null)}
          />
        )}
        {detailProject !== null && (
          <ProjectDetailModal
            project={detailProject}
            allTasks={tasks}
            allNotes={notes}
            onClose={() => setDetailProject(null)}
            onLinkTask={linkTaskToProject}
            onUnlinkTask={unlinkTaskFromProject}
            onLinkNote={linkNoteToProject}
            onUnlinkNote={unlinkNoteFromProject}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
