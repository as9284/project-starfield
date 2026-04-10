import { StickyNote } from "lucide-react";
import { useOrbitStore } from "../../store/useOrbitStore";
import type {
  ConstellationHandler,
  ParsedCommand,
  ActionResult,
} from "../constellation-registry";
import { sanitizeForPrompt } from "../constellation-registry";

// ── Result card ──────────────────────────────────────────────────────────────

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

// ── Handler ──────────────────────────────────────────────────────────────────

export const orbitHandler: ConstellationHandler = {
  tag: "orbit-commands",
  name: "Orbit",
  multiCommand: true,

  promptInstructions: `### Orbit Control — Tasks & Notes

\`\`\`orbit-commands
CREATE_TASK {"title":"...","description":"...","priority":"low|medium|high","due_date":"YYYY-MM-DD or null"}
COMPLETE_TASK {"id":"..."}
UNCOMPLETE_TASK {"id":"..."}
ARCHIVE_TASK {"id":"..."}
DELETE_TASK {"id":"..."}
CREATE_NOTE {"title":"...","content":"..."}
DELETE_NOTE {"id":"..."}
\`\`\`

Rules: Multiple commands per block are allowed, one per line. Priorities default to "medium". Omit optional fields if not provided. Use null for due_date if none given.`,

  buildContext(): string {
    const { tasks, notes } = useOrbitStore.getState();
    const activeTasks = tasks.filter((t) => !t.archived);

    if (activeTasks.length === 0 && notes.length === 0) return "";

    let ctx = "## Current Orbit State\n\n";

    if (activeTasks.length > 0) {
      ctx += `**Active Tasks (${activeTasks.length}):**\n`;
      ctx += activeTasks
        .map(
          (t) =>
            `- [${t.id}] "${sanitizeForPrompt(t.title)}" — priority: ${t.priority}${t.due_date ? `, due: ${t.due_date}` : ""}${t.description ? `, notes: ${sanitizeForPrompt(t.description)}` : ""}`,
        )
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

    ctx +=
      "\n\nUse task/note IDs when emitting commands that target existing items.";

    return ctx;
  },

  async execute(commands: ParsedCommand[]): Promise<ActionResult[]> {
    const store = useOrbitStore.getState();
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
              priority: (
                ["low", "medium", "high"].includes(String(args.priority))
                  ? args.priority
                  : "medium"
              ) as "low" | "medium" | "high",
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
          case "DELETE_TASK":
            store.deleteTask(String(args.id ?? ""));
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
        }
      } catch {
        /* skip malformed */
      }
    }

    if (count > 0) {
      return [{ type: "orbit_done", handler: "orbit-commands", count }];
    }
    return [];
  },

  ResultCard: OrbitDoneCard,
};
