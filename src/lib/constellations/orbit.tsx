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
  return <OrbitDoneCard result={result} />;
}

// ── Handler ──────────────────────────────────────────────────────────────────

export const orbitHandler: ConstellationHandler = {
  tag: "orbit-commands",
  name: "Orbit",
  multiCommand: true,

  promptInstructions: `### Orbit Control — Tasks, Notes, Projects, Writing & Meetings

\`\`\`orbit-commands
CREATE_TASK {"title":"...","description":"...","priority":"low|medium|high","due_date":"YYYY-MM-DD or null"}
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
            const rawDue = args.due_date;
            const dueDate =
              rawDue != null &&
              rawDue !== "null" &&
              typeof rawDue === "string" &&
              rawDue.trim() !== ""
                ? rawDue
                : null;
            store.createTask({
              title: String(args.title ?? ""),
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
            count++;
            break;
          }
          case "COMPLETE_TASK":
            store.completeTask(String(args.id ?? ""));
            count++;
            break;
          case "UNCOMPLETE_TASK":
            store.uncompleteTask(String(args.id ?? ""));
            count++;
            break;
          case "ARCHIVE_TASK":
            store.archiveTask(String(args.id ?? ""));
            count++;
            break;
          case "UNARCHIVE_TASK":
            store.unarchiveTask(String(args.id ?? ""));
            count++;
            break;
          case "DELETE_TASK":
            store.deleteTask(String(args.id ?? ""));
            count++;
            break;
          case "UPDATE_TASK": {
            const taskId = String(args.id ?? "");
            if (!taskId) break;
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
          case "ADD_SUBTASK":
            store.addSubTask(
              String(args.task_id ?? ""),
              String(args.title ?? ""),
            );
            count++;
            break;
          case "TOGGLE_SUBTASK":
            store.toggleSubTask(
              String(args.task_id ?? ""),
              String(args.subtask_id ?? ""),
            );
            count++;
            break;
          case "DELETE_SUBTASK":
            store.deleteSubTask(
              String(args.task_id ?? ""),
              String(args.subtask_id ?? ""),
            );
            count++;
            break;
          case "UPDATE_SUBTASK":
            store.updateSubTask(
              String(args.task_id ?? ""),
              String(args.subtask_id ?? ""),
              String(args.title ?? ""),
            );
            count++;
            break;
          case "CREATE_NOTE":
            store.createNote({
              title: String(args.title ?? ""),
              content: args.content != null ? String(args.content) : null,
            });
            count++;
            break;
          case "DELETE_NOTE":
            store.deleteNote(String(args.id ?? ""));
            count++;
            break;
          case "UPDATE_NOTE": {
            const noteId = String(args.id ?? "");
            if (!noteId) break;
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
      } catch {
        /* skip malformed */
      }
    }

    if (count > 0) {
      results.unshift({ type: "orbit_done", handler: "orbit-commands", count });
    }
    return results;
  },

  ResultCard: OrbitActionCard,
};
