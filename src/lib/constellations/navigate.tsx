import {
  ListTodo,
  CloudSun,
  Navigation,
  Link,
  Download,
  Radio,
  ArrowRight,
} from "lucide-react";
import { useAppStore, type AppView } from "../../store/useAppStore";
import {
  getConstellation,
  type ConstellationId,
} from "../constellation-catalog";
import { prefetchPage } from "../../App";
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
  "lyra",
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
  lyra: "Lyra",
};

const icons: Record<string, React.ReactNode> = {
  orbit: <ListTodo size={13} />,
  solaris: <CloudSun size={13} />,
  beacon: <Navigation size={13} />,
  hyperlane: <Link size={13} />,
  pulsar: <Download size={13} />,
  lyra: <Radio size={13} />,
};

function NavigatedCard({ result }: { result: ActionResult }) {
  const to = result.to as string;
  // Whether the user was already on the target when the command was issued
  const wasAlreadyThere = result.alreadyThere === true;
  // Whether the wormhole was auto-fired by execute()
  const autoNavigated = result.autoNavigated === true;

  const handleGo = () => {
    const entry = getConstellation(to as ConstellationId);
    prefetchPage(to as AppView);
    useAppStore
      .getState()
      .startWormhole(to as ControlledView, entry?.glowHex ?? "#7c4ff0");
  };

  // If user was already there, show a simple confirmation
  if (wasAlreadyThere) {
    return (
      <div className="luna-action-card luna-action-card-navigate">
        <div className="luna-navigate-header">
          <span className="luna-navigate-icon">{icons[to]}</span>
          <span className="luna-navigate-label">
            You&rsquo;re already on {labels[to] ?? to}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="luna-action-card luna-action-card-navigate">
      <div className="luna-navigate-header">
        <span className="luna-navigate-icon">{icons[to]}</span>
        <span className="luna-navigate-label">
          {autoNavigated
            ? `Navigating to ${labels[to] ?? to}`
            : `Navigate to ${labels[to] ?? to}`}
        </span>
      </div>
      {!autoNavigated && (
        <div className="luna-navigate-actions">
          <button className="luna-navigate-go" onClick={handleGo}>
            Go <ArrowRight size={11} />
          </button>
        </div>
      )}
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
NAVIGATE {"to":"orbit|solaris|beacon|hyperlane|pulsar|lyra"}
\`\`\`

Use this when the user asks to go to, open, or switch to a specific constellation.
Only one command per block. The user will see a card with a button to launch the wormhole transition — you do not need to describe the navigation process.
When the user says things like "go back" or "return to Luna", do NOT emit a navigate block — they will use the UI for that.`,

  buildContext(): string {
    // Current view is now injected at the top of the system prompt by
    // buildLunaSystemPrompt, so we don't duplicate it here.
    return "";
  },

  async execute(commands: ParsedCommand[]): Promise<ActionResult[]> {
    const cmd = commands[0];
    if (!cmd) return [];

    const destination = normalizeTarget(cmd.args.to);
    if (!destination) return [];

    const { view } = useAppStore.getState();

    // If the user is already on the target, don't navigate — just show confirmation
    if (view === destination) {
      return [
        {
          type: "navigated",
          handler: "navigate-commands",
          to: destination,
          alreadyThere: true,
        },
      ];
    }

    // Prefetch the page module so it's ready for the wormhole transition
    prefetchPage(destination);

    // Trigger wormhole transition
    const entry = getConstellation(destination);
    useAppStore
      .getState()
      .startWormhole(destination, entry?.glowHex ?? "#7c4ff0");

    return [
      {
        type: "navigated",
        handler: "navigate-commands",
        to: destination,
        autoNavigated: true,
      },
    ];
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
      /\b(?:open|go\s*to|switch\s*to|take\s*me\s*to|bring\s*me\s*to|show|navigate\s*to|launch)\s+(?:the\s+)?orbit\b/i,
    ],
    [
      "solaris",
      /\b(?:open|go\s*to|switch\s*to|take\s*me\s*to|bring\s*me\s*to|show|navigate\s*to|launch)\s+(?:the\s+)?(?:solaris|weather)\b/i,
    ],
    [
      "beacon",
      /\b(?:open|go\s*to|switch\s*to|take\s*me\s*to|bring\s*me\s*to|show|navigate\s*to|launch)\s+(?:the\s+)?beacon\b/i,
    ],
    [
      "hyperlane",
      /\b(?:open|go\s*to|switch\s*to|take\s*me\s*to|bring\s*me\s*to|show|navigate\s*to|launch)\s+(?:the\s+)?hyperlane\b/i,
    ],
    [
      "pulsar",
      /\b(?:open|go\s*to|switch\s*to|take\s*me\s*to|bring\s*me\s*to|show|navigate\s*to|launch)\s+(?:the\s+)?pulsar\b/i,
    ],
    [
      "lyra",
      /\b(?:open|go\s*to|switch\s*to|take\s*me\s*to|bring\s*me\s*to|show|navigate\s*to|launch)\s+(?:the\s+)?lyra\b/i,
    ],
  ];

  for (const [view, pattern] of patterns) {
    if (pattern.test(normalized)) return view;
  }

  return null;
}
