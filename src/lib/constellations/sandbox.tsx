import { useState } from "react";
import { Code, Copy, Check, ExternalLink, LayoutList } from "lucide-react";
import {
  useSandboxStore,
  type SandboxItemType,
} from "../../store/useSandboxStore";
import type {
  ConstellationHandler,
  ParsedCommand,
  ActionResult,
} from "../constellation-registry";

// ── Validation ───────────────────────────────────────────────────────────────

const VALID_TYPES: SandboxItemType[] = ["code", "plan", "chart"];

function isValidType(t: string): t is SandboxItemType {
  return (VALID_TYPES as string[]).includes(t);
}

// ── Result card ──────────────────────────────────────────────────────────────

function SandboxResultCard({ result }: { result: ActionResult }) {
  const [copied, setCopied] = useState(false);
  const openById = useSandboxStore((s) => s.openById);

  if (result.type === "sandbox_error") {
    return (
      <div className="luna-action-card luna-action-card-error">
        <Code size={14} style={{ flexShrink: 0 }} />
        <span>Sandbox: {result.error as string}</span>
      </div>
    );
  }

  const title = result.title as string;
  const itemType = result.itemType as SandboxItemType;
  const itemId = result.itemId as string;
  const content = result.content as string;

  const typeLabel =
    itemType === "code" ? "Code" : itemType === "plan" ? "Plan" : "Chart";

  const handleCopy = () => {
    void navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="luna-action-card luna-action-card-sandbox">
      <div className="luna-sandbox-card-header">
        {itemType === "code" ? (
          <Code
            size={13}
            style={{ color: "var(--color-nebula-blue)", flexShrink: 0 }}
          />
        ) : (
          <LayoutList
            size={13}
            style={{ color: "var(--color-nebula-blue)", flexShrink: 0 }}
          />
        )}
        <span className="luna-sandbox-card-label">{typeLabel}</span>
        <span className="luna-sandbox-card-title">{title}</span>
      </div>
      <div className="luna-sandbox-card-actions">
        <button className="luna-card-btn" onClick={() => openById(itemId)}>
          <ExternalLink size={12} />
          <span>Open in Sandbox</span>
        </button>
        <button className="luna-card-btn" onClick={handleCopy}>
          {copied ? <Check size={12} /> : <Copy size={12} />}
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
    </div>
  );
}

// ── Handler ──────────────────────────────────────────────────────────────────

export const sandboxHandler: ConstellationHandler = {
  tag: "sandbox-commands",
  name: "Sandbox",
  multiCommand: false,

  promptInstructions: `### Sandbox — Interactive Content Display

\`\`\`sandbox-commands
OPEN_SANDBOX {"type":"code|plan|chart","title":"...","content":"...","language":"..."}
\`\`\`

Use this when the user asks you to generate code, build a plan, create a chart, or display something in the sandbox. Only one command per block.

Types:
- **code** — Display generated code with syntax highlighting. Set \`language\` to the code language (e.g. "typescript", "python", "html"). Content is the raw source code.
- **plan** — Display a structured plan, outline, or checklist. Content is Markdown text. Use headings, numbered lists, checkboxes (- [ ]), and bold for emphasis.
- **chart** — Display a data chart. Content is a JSON object with \`chartType\` ("bar", "line", "area", or "pie"), \`data\` (array of objects), \`xKey\` (string), and \`series\` (array of {key, color?, name?}). Example: \`{"chartType":"bar","data":[{"month":"Jan","sales":40},{"month":"Feb","sales":65}],"xKey":"month","series":[{"key":"sales","color":"#7c4ff0","name":"Sales"}]}\`

Rules:
- Use the sandbox for substantial generated content — full code files, detailed plans, data visualisations. Short snippets belong in your normal response.
- For code, always set \`language\` so the user gets proper syntax highlighting.
- For chart data, ensure all objects in \`data\` have the \`xKey\` field and all \`series\` keys.
- The title should be concise and descriptive.
- Always explain what you created in your prose reply before the command block.`,

  buildContext(): string {
    const count = useSandboxStore.getState().items.length;
    if (count === 0) return "";
    return `## Sandbox — ${count} item${count === 1 ? "" : "s"} generated this session`;
  },

  async execute(commands: ParsedCommand[]): Promise<ActionResult[]> {
    const cmd = commands[0];
    if (!cmd) return [];

    const rawType = String(cmd.args.type ?? "code");
    const itemType: SandboxItemType = isValidType(rawType) ? rawType : "code";
    const title = String(cmd.args.title ?? "Untitled");
    const content = String(cmd.args.content ?? "");
    const language = cmd.args.language
      ? String(cmd.args.language)
      : undefined;

    if (!content.trim()) {
      return [
        {
          type: "sandbox_error",
          handler: "sandbox-commands",
          error: "No content provided",
        },
      ];
    }

    const item = {
      id: crypto.randomUUID(),
      type: itemType,
      title,
      content,
      language,
      createdAt: Date.now(),
    };

    useSandboxStore.getState().open(item);

    return [
      {
        type: "sandbox_opened",
        handler: "sandbox-commands",
        itemId: item.id,
        itemType,
        title,
        content,
      },
    ];
  },

  ResultCard: SandboxResultCard,
};
