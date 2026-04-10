import {
  ListTodo,
  CloudSun,
  Navigation,
  Link,
  Download,
} from "lucide-react";
import { useAppStore, type AppView } from "../../store/useAppStore";
import type {
  ConstellationHandler,
  ParsedCommand,
  ActionResult,
} from "../constellation-registry";

// ── Helpers ──────────────────────────────────────────────────────────────────

type ControlledView = Exclude<AppView, "luna" | "settings">;

const VALID_TARGETS: ControlledView[] = [
  "orbit",
  "solaris",
  "beacon",
  "hyperlane",
  "pulsar",
];

function normalizeTarget(value: unknown): ControlledView | null {
  const target = String(value ?? "")
    .trim()
    .toLowerCase() as ControlledView;
  return VALID_TARGETS.includes(target) ? target : null;
}

// ── Result card ──────────────────────────────────────────────────────────────

const labels: Record<string, string> = {
  orbit: "Orbit",
  solaris: "Solaris",
  beacon: "Beacon",
  hyperlane: "Hyperlane",
  pulsar: "Pulsar",
};

const icons: Record<string, React.ReactNode> = {
  orbit: <ListTodo size={13} />,
  solaris: <CloudSun size={13} />,
  beacon: <Navigation size={13} />,
  hyperlane: <Link size={13} />,
  pulsar: <Download size={13} />,
};

function NavigatedCard({ result }: { result: ActionResult }) {
  const to = result.to as string;
  return (
    <div className="luna-action-card luna-action-card-navigate">
      <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
        <span style={{ color: "var(--color-nebula-teal)" }}>{icons[to]}</span>
        <span className="luna-navigate-label">
          Switched to {labels[to] ?? to}
        </span>
      </div>
    </div>
  );
}

// ── Handler ──────────────────────────────────────────────────────────────────

export const navigateHandler: ConstellationHandler = {
  tag: "navigate-commands",
  name: "Navigation",
  multiCommand: false,

  promptInstructions: `### Navigation — Switch Constellation

\`\`\`navigate-commands
NAVIGATE {"to":"orbit|solaris|beacon|hyperlane|pulsar"}
\`\`\`

Use this when the user asks to go to, open, or switch to a specific constellation. Only one command per block.`,

  buildContext(): string {
    return "";
  },

  async execute(commands: ParsedCommand[]): Promise<ActionResult[]> {
    const cmd = commands[0];
    if (!cmd) return [];

    const destination = normalizeTarget(cmd.args.to);
    if (!destination) return [];

    useAppStore.getState().setView(destination);
    return [{ type: "navigated", handler: "navigate-commands", to: destination }];
  },

  ResultCard: NavigatedCard,
};

/**
 * Regex-based fallback: detect navigation intent from user text
 * even when the LLM does not emit a navigate-commands block.
 */
export function inferNavigationTarget(text: string): ControlledView | null {
  const normalized = text.trim().toLowerCase();
  const patterns: Array<[ControlledView, RegExp]> = [
    [
      "orbit",
      /\b(?:open|go to|switch to|take me to|bring me to|show|navigate to)\s+(?:the\s+)?orbit\b/i,
    ],
    [
      "solaris",
      /\b(?:open|go to|switch to|take me to|bring me to|show|navigate to)\s+(?:the\s+)?solaris\b/i,
    ],
    [
      "beacon",
      /\b(?:open|go to|switch to|take me to|bring me to|show|navigate to)\s+(?:the\s+)?beacon\b/i,
    ],
    [
      "hyperlane",
      /\b(?:open|go to|switch to|take me to|bring me to|show|navigate to)\s+(?:the\s+)?hyperlane\b/i,
    ],
    [
      "pulsar",
      /\b(?:open|go to|switch to|take me to|bring me to|show|navigate to)\s+(?:the\s+)?pulsar\b/i,
    ],
  ];

  for (const [view, pattern] of patterns) {
    if (pattern.test(normalized)) return view;
  }

  return null;
}
