import { useState } from "react";
import {
  StickyNote,
  PenLine,
  Check,
  Copy,
  ExternalLink,
  Sparkles,
} from "lucide-react";
import { useOrbitStore, VALID_PROJECT_COLORS } from "../../store/useOrbitStore";
import { useOrbitMeetingStore } from "../../store/useOrbitMeetingStore";
import { useAppStore } from "../../store/useAppStore";
import { processWriting, WRITING_MODES } from "../orbit-ai";
import type { WritingMode } from "../orbit-ai";
import type {
  ConstellationHandler,
  ParsedCommand,
  ActionResult,
} from "../constellation-registry";
import { sanitizeForPrompt } from "../constellation-registry";

// ── Helpers ──────────────────────────────────────────────────────────────────

function isValidProjectColor(
  color: string,
): color is (typeof VALID_PROJECT_COLORS)[number] {
  return (VALID_PROJECT_COLORS as readonly string[]).includes(color);
}

// ── Result cards ─────────────────────────────────────────────────────────────

function OrbitDoneCard({ result }: { result: ActionResult }) {
  const count = (result as ActionResult & { count: number }).count;
  return (
    <div className="luna-action-card luna-action-card-orbit">
      <StickyNote
        size={13}
        style={{ color: "var(--color-nebula-teal)", flexShrink: 0 }}
      />
      <span>
        {count === 1
          ? "1 Orbit action executed"
          : `${count} Orbit actions executed`}
      </span>
    </div>
  );
}

function OrbitErrorCard({ result }: { result: ActionResult }) {
  const cmd = String(result.command ?? "");
  const msg = String(result.message ?? "Unknown error");
  return (
    <div
      className="luna-action-card"
      style={{
        background: "rgba(248, 113, 113, 0.06)",
        border: "1px solid rgba(248, 113, 113, 0.18)",
      }}
    >
      <span style={{ color: "rgba(248, 113, 113, 0.7)", fontSize: 11 }}>
        ✗
      </span>
      <span style={{ color: "rgba(248, 113, 113, 0.85)", fontSize: 12 }}>
        {cmd ? `${cmd}: ${msg}` : msg}
      </span>
    </div>
  );
}

function WritingResultCard({ result }: { result: ActionResult }) {
  const [copied, setCopied] = useState(false);
  const mode = result.mode as WritingMode;
  const text = result.text as string | null;
  const error = result.error as string | null;
  const modeLabel = WRITING_MODES.find((m) => m.mode === mode)?.label ?? mode;

  if (error || !text) {
    return (
      <div className="luna-action-card luna-action-card-error">
        <PenLine size={13} style={{ flexShrink: 0 }} />
        <span>Writing assistant: {error ?? "No result"}</span>
      </div>
    );
  }

  const handleCopy = () => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="luna-action-card luna-action-card-writing">
      <div className="luna-writing-header">
        <PenLine
          size={13}
          style={{ color: "var(--color-purple-400)", flexShrink: 0 }}
        />
        <span className="luna-writing-label">{modeLabel}</span>
        <button
          onClick={handleCopy}
          className="luna-writing-copy-btn"
          title="Copy result"
        >
          {copied ? (
            <Check size={11} style={{ color: "var(--color-nebula-teal)" }} />
          ) : (
            <Copy size={11} />
          )}
        </button>
      </div>
      <pre className="luna-writing-result">{text}</pre>
    </div>
  );
}

function MeetingOpenedCard({
  result,
  onNavigate,
}: {
  result: ActionResult;
  onNavigate?: (view: string) => void;
}) {
  const title = result.meetingTitle as string;
  return (
    <div className="luna-action-card luna-action-card-meeting">
      <div className="luna-meeting-header">
        <Sparkles
          size={13}
          style={{ color: "var(--color-nebula-teal)", flexShrink: 0 }}
        />
        <span className="luna-meeting-label">Meeting mode ready</span>
      </div>
      {title && <p className="luna-meeting-title">"{title}"</p>}
      <button
        className="luna-meeting-open-btn"
        onClick={() => onNavigate?.("orbit")}
      >
        <ExternalLink size={11} />
        Open Orbit → Meeting tab
      </button>
    </div>
  );
}

function OrbitActionCard({
  result,
  onNavigate,
}: {
  result: ActionResult;
  onNavigate?: (view: string) => void;
}) {
  if (result.type === "writing_result")
    return <WritingResultCard result={result} />;
  if (result.type === "meeting_opened")
    return <MeetingOpenedCard result={result} onNavigate={onNavigate} />;
  if (result.type === "orbit_error")
    return <OrbitErrorCard result={result} />;
  return <OrbitDoneCard result={result} />;
}

// ── Handler ──────────────────────────────────────────────────────────────────

export const orbitHandler: ConstellationHandler = {
  tag: "orbit-commands",
  name: "Orbit",
  multiCommand: true,

  promptInstructions: `### Orbit Control — Tasks, Notes, Projects, Writing & Meetings

\`\`\`orbit-commands
CREATE_TASK {"title":"...","description":"...","priority":"low|medium|high","due_date":"YYYY-MM-DD or null","sub_tasks":["...","..."]}
UPDATE_TASK {"id":"...","title":"...","description":"...","priority":"low|medium|high","due_date":"YYYY-MM-DD or null"}
COMPLETE_TASK {"id":"..."}
UNCOMPLETE_TASK {"id":"..."}
ARCHIVE_TASK {"id":"..."}
UNARCHIVE_TASK {"id":"..."}
DELETE_TASK {"id":"..."}
ADD_SUBTASK {"task_id":"...","title":"..."}
TOGGLE_SUBTASK {"task_id":"...","subtask_id":"..."}
UPDATE_SUBTASK {"task_id":"...","subtask_id":"...","title":"..."}
DELETE_SUBTASK {"task_id":"...","subtask_id":"..."}
CREATE_NOTE {"title":"...","content":"..."}
UPDATE_NOTE {"id":"...","title":"...","content":"..."}
DELETE_NOTE {"id":"..."}
CREATE_PROJECT {"name":"...","description":"...","color":"violet|purple|blue|cyan|emerald|amber|rose|pink","deadline":"YYYY-MM-DD or null"}
UPDATE_PROJECT {"id":"...","name":"...","description":"...","color":"violet|purple|blue|cyan|emerald|amber|rose|pink","deadline":"YYYY-MM-DD or null"}
DELETE_PROJECT {"id":"..."}
LINK_TASK {"project_id":"...","task_id":"..."}
UNLINK_TASK {"project_id":"...","task_id":"..."}
LINK_NOTE {"project_id":"...","note_id":"..."}
UNLINK_NOTE {"project_id":"...","note_id":"..."}
PROCESS_WRITING {"mode":"improve|grammar|rephrase|formal|casual|expand|shorten|bullets|continue|email","text":"..."}
OPEN_MEETING {"title":"..."}
\`\`\`

Rules: Multiple commands per block are allowed, one per line. Priorities default to "medium". Omit optional fields if not provided. Use null for due_date/deadline if none given. For UPDATE_* commands, only include fields you want to change.

CREATE_TASK: When creating a task with sub-tasks, use the "sub_tasks" array field containing an array of title strings. All sub-tasks are created in one atomic operation.

PROCESS_WRITING: Use when the user asks you to improve, fix, rephrase, expand, shorten, convert to bullets, continue, make formal/casual, or format as email. Always use this command to show the result as a copyable card rather than writing the text in your prose response. Text must be the exact content to transform, not a summary.

OPEN_MEETING: Use when the user says they want to start, begin, or open a meeting. This pre-fills the meeting title in the Orbit Meeting tab and navigates there automatically.

LINK_TASK / UNLINK_TASK / LINK_NOTE / UNLINK_NOTE: Use to add or remove tasks and notes from projects. Always reference IDs from context.`,

  buildContext(): string {
    const { tasks, notes, projects } = useOrbitStore.getState();
    const { activeSession, sessions } = useOrbitMeetingStore.getState();
    const activeTasks = tasks.filter((t) => !t.archived);

    if (
      activeTasks.length === 0 &&
      notes.length === 0 &&
      projects.length === 0 &&
      !activeSession &&
      sessions.length === 0
    )
      return "";

    let ctx =
      "## Orbit Data (available for reference — does not indicate the user is currently on Orbit)\n\n";

    if (activeTasks.length > 0) {
      ctx += `**Active Tasks (${activeTasks.length}):**\n`;
      ctx += activeTasks
        .map((t) => {
          let line = `- [${t.id}] "${sanitizeForPrompt(t.title)}" — priority: ${t.priority}${t.due_date ? `, due: ${t.due_date}` : ""}${t.description ? `, notes: ${sanitizeForPrompt(t.description)}` : ""}`;
          if (t.sub_tasks && t.sub_tasks.length > 0) {
            const done = t.sub_tasks.filter((s) => s.completed).length;
            line += ` | sub-tasks: ${done}/${t.sub_tasks.length} done`;
            line +=
              "\n" +
              t.sub_tasks
                .map(
                  (s) =>
                    `  - [${s.id}] [${s.completed ? "x" : " "}] "${sanitizeForPrompt(s.title)}"`,
                )
                .join("\n");
          }
          return line;
        })
        .join("\n");
    } else {
      ctx += "**No active tasks.**";
    }

    ctx += "\n\n";

    if (notes.length > 0) {
      ctx += `**Notes (${notes.length}):**\n`;
      ctx += notes
        .map(
          (n) =>
            `- [${n.id}] "${sanitizeForPrompt(n.title)}"${n.content ? `: ${sanitizeForPrompt(n.content)}` : ""}`,
        )
        .join("\n");
    } else {
      ctx += "**No notes.**";
    }

    if (projects.length > 0) {
      ctx += "\n\n";
      ctx += `**Projects (${projects.length}):**\n`;
      ctx += projects
        .map((p) => {
          let line = `- [${p.id}] "${sanitizeForPrompt(p.name)}"${p.description ? ` — ${sanitizeForPrompt(p.description)}` : ""}${p.deadline ? `, deadline: ${p.deadline}` : ""}`;
          if (p.taskIds.length > 0)
            line += ` | linked task IDs: ${p.taskIds.join(", ")}`;
          if (p.noteIds.length > 0)
            line += ` | linked note IDs: ${p.noteIds.join(", ")}`;
          if (p.taskIds.length === 0 && p.noteIds.length === 0)
            line += ` | no linked items`;
          return line;
        })
        .join("\n");
    }

    if (activeSession) {
      ctx += "\n\n";
      ctx += `**Active Meeting:** "${sanitizeForPrompt(activeSession.title)}" with ${activeSession.entries.length} notes captured so far.`;
    }

    if (sessions.length > 0) {
      ctx += "\n\n";
      ctx += `**Past Meetings:** ${sessions.length} completed session${sessions.length !== 1 ? "s" : ""}.`;
    }

    ctx +=
      "\n\nOrbit also has a Writing Assistant tab (AI-powered text transformation) and a Meeting Mode tab (capture notes → auto-generate summary + task). Use task/note/project IDs when emitting commands that target existing items.";

    return ctx;
  },

  async execute(commands: ParsedCommand[]): Promise<ActionResult[]> {
    const store = useOrbitStore.getState();
    const results: ActionResult[] = [];
    let count = 0;

    for (const { command, args } of commands) {
      try {
        switch (command) {
          case "CREATE_TASK": {
            const title = String(args.title ?? "").trim();
            if (!title) {
              results.push({ type: "orbit_error", handler: "orbit-commands", command: "CREATE_TASK", message: "Title is required." });
              break;
            }
            const rawDue = args.due_date;
            const dueDate =
              rawDue != null &&
              rawDue !== "null" &&
              typeof rawDue === "string" &&
              rawDue.trim() !== ""
                ? rawDue
                : null;
            const rawSubTasks = args.sub_tasks;
            const subTaskTitles: string[] =
              Array.isArray(rawSubTasks)
                ? rawSubTasks
                    .filter((s) => typeof s === "string" && String(s).trim())
                    .map((s) => String(s).trim())
                : [];
            if (subTaskTitles.length > 0) {
              store.createTaskWithSubTasks(
                {
                  title,
                  description:
                    args.description != null && args.description !== "null"
                      ? String(args.description)
                      : null,
                  priority: (["low", "medium", "high"].includes(
                    String(args.priority),
                  )
                    ? args.priority
                    : "medium") as "low" | "medium" | "high",
                  due_date: dueDate,
                },
                subTaskTitles,
              );
            } else {
              store.createTask({
                title,
                description:
                  args.description != null && args.description !== "null"
                    ? String(args.description)
                    : null,
                priority: (["low", "medium", "high"].includes(
                  String(args.priority),
                )
                  ? args.priority
                  : "medium") as "low" | "medium" | "high",
                due_date: dueDate,
              });
            }
            count++;
            break;
          }
          case "COMPLETE_TASK": {
            const id = String(args.id ?? "");
            if (!id || !store.tasks.find((t) => t.id === id)) {
              results.push({ type: "orbit_error", handler: "orbit-commands", command: "COMPLETE_TASK", message: `Task not found: ${id}` });
              break;
            }
            store.completeTask(id);
            count++;
            break;
          }
          case "UNCOMPLETE_TASK": {
            const id = String(args.id ?? "");
            if (!id || !store.tasks.find((t) => t.id === id)) {
              results.push({ type: "orbit_error", handler: "orbit-commands", command: "UNCOMPLETE_TASK", message: `Task not found: ${id}` });
              break;
            }
            store.uncompleteTask(id);
            count++;
            break;
          }
          case "ARCHIVE_TASK": {
            const id = String(args.id ?? "");
            if (!id || !store.tasks.find((t) => t.id === id)) {
              results.push({ type: "orbit_error", handler: "orbit-commands", command: "ARCHIVE_TASK", message: `Task not found: ${id}` });
              break;
            }
            store.archiveTask(id);
            count++;
            break;
          }
          case "UNARCHIVE_TASK": {
            const id = String(args.id ?? "");
            if (!id || !store.tasks.find((t) => t.id === id)) {
              results.push({ type: "orbit_error", handler: "orbit-commands", command: "UNARCHIVE_TASK", message: `Task not found: ${id}` });
              break;
            }
            store.unarchiveTask(id);
            count++;
            break;
          }
          case "DELETE_TASK": {
            const id = String(args.id ?? "");
            if (!id || !store.tasks.find((t) => t.id === id)) {
              results.push({ type: "orbit_error", handler: "orbit-commands", command: "DELETE_TASK", message: `Task not found: ${id}` });
              break;
            }
            store.deleteTask(id);
            count++;
            break;
          }
          case "UPDATE_TASK": {
            const taskId = String(args.id ?? "");
            if (!taskId || !store.tasks.find((t) => t.id === taskId)) {
              results.push({ type: "orbit_error", handler: "orbit-commands", command: "UPDATE_TASK", message: `Task not found: ${taskId}` });
              break;
            }
            const taskUpdates: Parameters<typeof store.updateTask>[1] = {};
            if (args.title !== undefined)
              taskUpdates.title = String(args.title);
            if (args.description !== undefined)
              taskUpdates.description =
                args.description === "null" || args.description === null
                  ? null
                  : String(args.description);
            if (
              args.priority !== undefined &&
              ["low", "medium", "high"].includes(String(args.priority))
            )
              taskUpdates.priority = args.priority as "low" | "medium" | "high";
            if (args.due_date !== undefined)
              taskUpdates.due_date =
                args.due_date === "null" || args.due_date === null
                  ? null
                  : String(args.due_date);
            store.updateTask(taskId, taskUpdates);
            count++;
            break;
          }
          case "ADD_SUBTASK": {
            const task_id = String(args.task_id ?? "");
            if (!task_id || !store.tasks.find((t) => t.id === task_id)) {
              results.push({ type: "orbit_error", handler: "orbit-commands", command: "ADD_SUBTASK", message: `Task not found: ${task_id}` });
              break;
            }
            const title = String(args.title ?? "").trim();
            if (!title) {
              results.push({ type: "orbit_error", handler: "orbit-commands", command: "ADD_SUBTASK", message: "Sub-task title is required." });
              break;
            }
            store.addSubTask(task_id, title);
            count++;
            break;
          }
          case "TOGGLE_SUBTASK": {
            const task_id = String(args.task_id ?? "");
            const subtask_id = String(args.subtask_id ?? "");
            const task = store.tasks.find((t) => t.id === task_id);
            if (!task_id || !task) {
              results.push({ type: "orbit_error", handler: "orbit-commands", command: "TOGGLE_SUBTASK", message: `Task not found: ${task_id}` });
              break;
            }
            if (!subtask_id || !task.sub_tasks.find((st) => st.id === subtask_id)) {
              results.push({ type: "orbit_error", handler: "orbit-commands", command: "TOGGLE_SUBTASK", message: `Sub-task not found: ${subtask_id}` });
              break;
            }
            store.toggleSubTask(task_id, subtask_id);
            count++;
            break;
          }
          case "DELETE_SUBTASK": {
            const task_id = String(args.task_id ?? "");
            const subtask_id = String(args.subtask_id ?? "");
            const task = store.tasks.find((t) => t.id === task_id);
            if (!task_id || !task) {
              results.push({ type: "orbit_error", handler: "orbit-commands", command: "DELETE_SUBTASK", message: `Task not found: ${task_id}` });
              break;
            }
            if (!subtask_id || !task.sub_tasks.find((st) => st.id === subtask_id)) {
              results.push({ type: "orbit_error", handler: "orbit-commands", command: "DELETE_SUBTASK", message: `Sub-task not found: ${subtask_id}` });
              break;
            }
            store.deleteSubTask(task_id, subtask_id);
            count++;
            break;
          }
          case "UPDATE_SUBTASK": {
            const task_id = String(args.task_id ?? "");
            const subtask_id = String(args.subtask_id ?? "");
            const task = store.tasks.find((t) => t.id === task_id);
            if (!task_id || !task) {
              results.push({ type: "orbit_error", handler: "orbit-commands", command: "UPDATE_SUBTASK", message: `Task not found: ${task_id}` });
              break;
            }
            if (!subtask_id || !task.sub_tasks.find((st) => st.id === subtask_id)) {
              results.push({ type: "orbit_error", handler: "orbit-commands", command: "UPDATE_SUBTASK", message: `Sub-task not found: ${subtask_id}` });
              break;
            }
            const title = String(args.title ?? "").trim();
            if (!title) {
              results.push({ type: "orbit_error", handler: "orbit-commands", command: "UPDATE_SUBTASK", message: "Sub-task title is required." });
              break;
            }
            store.updateSubTask(task_id, subtask_id, title);
            count++;
            break;
          }
          case "CREATE_NOTE": {
            const title = String(args.title ?? "").trim();
            if (!title) {
              results.push({ type: "orbit_error", handler: "orbit-commands", command: "CREATE_NOTE", message: "Title is required." });
              break;
            }
            store.createNote({
              title,
              content: args.content != null ? String(args.content) : null,
            });
            count++;
            break;
          }
          case "DELETE_NOTE": {
            const id = String(args.id ?? "");
            if (!id || !store.notes.find((n) => n.id === id)) {
              results.push({ type: "orbit_error", handler: "orbit-commands", command: "DELETE_NOTE", message: `Note not found: ${id}` });
              break;
            }
            store.deleteNote(id);
            count++;
            break;
          }
          case "UPDATE_NOTE": {
            const noteId = String(args.id ?? "");
            if (!noteId || !store.notes.find((n) => n.id === noteId)) {
              results.push({ type: "orbit_error", handler: "orbit-commands", command: "UPDATE_NOTE", message: `Note not found: ${noteId}` });
              break;
            }
            const noteUpdates: Parameters<typeof store.updateNote>[1] = {};
            if (args.title !== undefined)
              noteUpdates.title = String(args.title);
            if (args.content !== undefined)
              noteUpdates.content =
                args.content === "null" || args.content === null
                  ? null
                  : String(args.content);
            store.updateNote(noteId, noteUpdates);
            count++;
            break;
          }
          case "CREATE_PROJECT": {
            const rawDeadline = args.deadline;
            const deadline =
              rawDeadline != null &&
              rawDeadline !== "null" &&
              typeof rawDeadline === "string" &&
              rawDeadline.trim() !== ""
                ? rawDeadline
                : null;
            store.createProject({
              name: String(args.name ?? ""),
              description:
                args.description != null && args.description !== "null"
                  ? String(args.description)
                  : undefined,
              color: isValidProjectColor(String(args.color))
                ? String(args.color)
                : "violet",
              deadline,
            });
            count++;
            break;
          }
          case "DELETE_PROJECT":
            store.deleteProject(String(args.id ?? ""));
            count++;
            break;
          case "UPDATE_PROJECT": {
            const projId = String(args.id ?? "");
            if (!projId) break;
            const projUpdates: Parameters<typeof store.updateProject>[1] = {};
            if (args.name !== undefined) projUpdates.name = String(args.name);
            if (args.description !== undefined)
              projUpdates.description = String(args.description);
            if (
              args.color !== undefined &&
              isValidProjectColor(String(args.color))
            )
              projUpdates.color = String(args.color);
            if (args.deadline !== undefined)
              projUpdates.deadline =
                args.deadline === "null" || args.deadline === null
                  ? null
                  : String(args.deadline);
            store.updateProject(projId, projUpdates);
            count++;
            break;
          }
          case "LINK_TASK":
            store.linkTaskToProject(
              String(args.project_id ?? ""),
              String(args.task_id ?? ""),
            );
            count++;
            break;
          case "UNLINK_TASK":
            store.unlinkTaskFromProject(
              String(args.project_id ?? ""),
              String(args.task_id ?? ""),
            );
            count++;
            break;
          case "LINK_NOTE":
            store.linkNoteToProject(
              String(args.project_id ?? ""),
              String(args.note_id ?? ""),
            );
            count++;
            break;
          case "UNLINK_NOTE":
            store.unlinkNoteFromProject(
              String(args.project_id ?? ""),
              String(args.note_id ?? ""),
            );
            count++;
            break;

          case "PROCESS_WRITING": {
            const mode = String(args.mode ?? "improve") as WritingMode;
            const text = String(args.text ?? "").trim();
            if (text) {
              const writingResult = await processWriting(text, mode);
              results.push({
                type: "writing_result",
                handler: "orbit-commands",
                mode,
                text: writingResult.text,
                error: writingResult.error,
              });
            }
            break;
          }

          case "OPEN_MEETING": {
            const title = String(args.title ?? "").trim();
            // Signal Orbit to switch to meeting tab and pre-fill the title
            useOrbitMeetingStore
              .getState()
              .requestOrbitTab("meeting", title || undefined);
            // Navigate to Orbit
            useAppStore.getState().setView("orbit");
            results.push({
              type: "meeting_opened",
              handler: "orbit-commands",
              meetingTitle: title,
            });
            break;
          }
        }
        } catch (err) {
          results.push({ type: "orbit_error", handler: "orbit-commands", command, message: String(err) });
        }
    }

    if (count > 0) {
      results.unshift({ type: "orbit_done", handler: "orbit-commands", count });
    }
    return results;
  },

  ResultCard: OrbitActionCard,
};
