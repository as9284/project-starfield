/**
 * Slash Command Catalog — user-facing shortcut definitions for Luna's
 * command mode. Each entry maps a `/command` to the existing constellation
 * handler that does the actual work, so there is zero duplicated logic.
 *
 * The catalog is the single source of truth for:
 *  - Command names and aliases shown in the autocomplete
 *  - Syntax hints and placeholder text
 *  - Argument parsing from the user's raw input
 *  - Routing to the correct constellation handler + command
 */

import type { LucideIcon } from "lucide-react";
import {
  Navigation,
  CloudSun,
  Link,
  Download,
  ListTodo,
  StickyNote,
  FolderKanban,
  PenLine,
  Sparkles,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

export interface SlashCommand {
  /** Primary name typed after `/`, e.g. "go" */
  name: string;
  /** Alternative names that also match, e.g. ["navigate", "open"] */
  aliases: string[];
  /** Short description shown in the suggestion panel */
  description: string;
  /** Example usage shown as hint text */
  example: string;
  /** Lucide icon for the suggestion row */
  icon: LucideIcon;
  /** Constellation handler tag to route to */
  handlerTag: string;
  /** Command name inside the handler (e.g. "NAVIGATE", "GET_WEATHER") */
  handlerCommand: string;
  /** Whether this command requires an argument */
  requiresArg: boolean;
  /** Placeholder text shown when the command is selected but missing args */
  argPlaceholder: string;
  /**
   * Parse the user's raw argument string into the `args` record expected
   * by the constellation handler. Return `null` if the input is invalid.
   */
  parseArgs: (raw: string) => Record<string, unknown> | null;
  /** Accent color for the suggestion row (CSS string) */
  accent: string;
}

// ── Argument parsers ─────────────────────────────────────────────────────────

const VALID_NAV_TARGETS = ["orbit", "solaris", "beacon", "hyperlane", "pulsar"];

function parseNavTarget(raw: string): Record<string, unknown> | null {
  const target = raw.trim().toLowerCase();
  if (VALID_NAV_TARGETS.includes(target)) return { to: target };
  // Fuzzy: check if any target starts with the input
  const match = VALID_NAV_TARGETS.find((t) => t.startsWith(target));
  if (match) return { to: match };
  return null;
}

function parseLocation(raw: string): Record<string, unknown> | null {
  const location = raw.trim();
  if (!location) return null;
  return { location };
}

function parseUrl(raw: string): Record<string, unknown> | null {
  const url = raw.trim();
  if (!url) return null;
  // Basic URL validation — must look like a URL
  if (!/^https?:\/\/.+/i.test(url) && !/^[a-z0-9].*\..+/i.test(url)) {
    return null;
  }
  // Prepend https:// if missing
  const normalized = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  return { url: normalized };
}

function parseDownload(raw: string): Record<string, unknown> | null {
  const parts = raw.trim().split(/\s+/);
  const url = parts[0];
  if (!url) return null;
  if (!/^https?:\/\/.+/i.test(url) && !/^[a-z0-9].*\..+/i.test(url)) {
    return null;
  }
  const normalized = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  const format = parts[1]?.toLowerCase();
  const validFormats = ["best", "audio", "720", "1080"];
  return {
    url: normalized,
    format: validFormats.includes(format ?? "") ? format : "best",
  };
}

function parseTask(raw: string): Record<string, unknown> | null {
  const title = raw.trim();
  if (!title) return null;
  return { title, priority: "medium" };
}

function parseNote(raw: string): Record<string, unknown> | null {
  const title = raw.trim();
  if (!title) return null;
  return { title };
}

function parseProject(raw: string): Record<string, unknown> | null {
  const name = raw.trim();
  if (!name) return null;
  return { name, color: "violet" };
}

function parseWriting(raw: string): Record<string, unknown> | null {
  // Format: mode text (e.g., "improve Hello world")
  const spaceIdx = raw.indexOf(" ");
  if (spaceIdx === -1) {
    // Just the mode, no text yet
    const mode = raw.trim().toLowerCase();
    const validModes = [
      "improve",
      "grammar",
      "rephrase",
      "formal",
      "casual",
      "expand",
      "shorten",
      "bullets",
      "continue",
      "email",
    ];
    if (validModes.includes(mode)) return null; // valid mode but missing text
    return null;
  }
  const mode = raw.slice(0, spaceIdx).trim().toLowerCase();
  const text = raw.slice(spaceIdx + 1).trim();
  const validModes = [
    "improve",
    "grammar",
    "rephrase",
    "formal",
    "casual",
    "expand",
    "shorten",
    "bullets",
    "continue",
    "email",
  ];
  if (!validModes.includes(mode) || !text) return null;
  return { mode, text };
}

function parseMeeting(raw: string): Record<string, unknown> | null {
  const title = raw.trim();
  return { title: title || "Untitled Meeting" };
}

// ── Catalog ──────────────────────────────────────────────────────────────────

export const SLASH_COMMANDS: readonly SlashCommand[] = [
  {
    name: "go",
    aliases: ["navigate", "open", "switch"],
    description: "Navigate to a constellation",
    example: "/go orbit",
    icon: Navigation,
    handlerTag: "navigate-commands",
    handlerCommand: "NAVIGATE",
    requiresArg: true,
    argPlaceholder: "orbit | solaris | beacon | hyperlane | pulsar",
    parseArgs: parseNavTarget,
    accent: "var(--color-purple-400)",
  },
  {
    name: "weather",
    aliases: ["forecast", "temperature"],
    description: "Check weather for a location",
    example: "/weather Tokyo",
    icon: CloudSun,
    handlerTag: "solaris-commands",
    handlerCommand: "GET_WEATHER",
    requiresArg: true,
    argPlaceholder: "city name",
    parseArgs: parseLocation,
    accent: "var(--color-nebula-pink)",
  },
  {
    name: "shorten",
    aliases: ["short", "link"],
    description: "Shorten a URL via Hyperlane",
    example: "/shorten https://example.com/long-path",
    icon: Link,
    handlerTag: "hyperlane-commands",
    handlerCommand: "SHORTEN_URL",
    requiresArg: true,
    argPlaceholder: "https://...",
    parseArgs: parseUrl,
    accent: "var(--color-nebula-teal)",
  },
  {
    name: "download",
    aliases: ["dl", "grab", "pull"],
    description: "Download media via Pulsar",
    example: "/download https://youtube.com/watch?v=... [format]",
    icon: Download,
    handlerTag: "pulsar-commands",
    handlerCommand: "DOWNLOAD_MEDIA",
    requiresArg: true,
    argPlaceholder: "url [best|audio|720|1080]",
    parseArgs: parseDownload,
    accent: "var(--color-purple-400)",
  },
  {
    name: "task",
    aliases: ["todo", "add-task"],
    description: "Create a new Orbit task",
    example: "/task Buy groceries",
    icon: ListTodo,
    handlerTag: "orbit-commands",
    handlerCommand: "CREATE_TASK",
    requiresArg: true,
    argPlaceholder: "task title",
    parseArgs: parseTask,
    accent: "var(--color-purple-400)",
  },
  {
    name: "note",
    aliases: ["add-note"],
    description: "Create a new Orbit note",
    example: "/note Meeting summary",
    icon: StickyNote,
    handlerTag: "orbit-commands",
    handlerCommand: "CREATE_NOTE",
    requiresArg: true,
    argPlaceholder: "note title",
    parseArgs: parseNote,
    accent: "var(--color-purple-400)",
  },
  {
    name: "project",
    aliases: ["add-project"],
    description: "Create a new Orbit project",
    example: "/project Website Redesign",
    icon: FolderKanban,
    handlerTag: "orbit-commands",
    handlerCommand: "CREATE_PROJECT",
    requiresArg: true,
    argPlaceholder: "project name",
    parseArgs: parseProject,
    accent: "var(--color-purple-400)",
  },
  {
    name: "write",
    aliases: ["rewrite", "improve", "fix"],
    description: "Transform text (improve, grammar, formal...)",
    example: "/write improve Your text here",
    icon: PenLine,
    handlerTag: "orbit-commands",
    handlerCommand: "PROCESS_WRITING",
    requiresArg: true,
    argPlaceholder: "mode text (e.g. improve Hello world)",
    parseArgs: parseWriting,
    accent: "var(--color-purple-400)",
  },
  {
    name: "meeting",
    aliases: ["meet"],
    description: "Start an Orbit meeting session",
    example: "/meeting Sprint Planning",
    icon: Sparkles,
    handlerTag: "orbit-commands",
    handlerCommand: "OPEN_MEETING",
    requiresArg: false,
    argPlaceholder: "meeting title (optional)",
    parseArgs: parseMeeting,
    accent: "var(--color-purple-400)",
  },
];

// ── Matching helpers ─────────────────────────────────────────────────────────

/** Find commands whose name or aliases match the typed prefix. */
export function matchCommands(query: string): SlashCommand[] {
  const q = query.toLowerCase();
  if (!q) return [...SLASH_COMMANDS];

  return SLASH_COMMANDS.filter(
    (cmd) => cmd.name.startsWith(q) || cmd.aliases.some((a) => a.startsWith(q)),
  );
}

/**
 * Parse a full slash input string into a resolved command + raw args.
 * Returns `null` if the input doesn't match any command.
 */
export function resolveSlashInput(
  input: string,
): { command: SlashCommand; rawArgs: string } | null {
  // Strip leading slash
  const body = input.slice(1).trimStart();
  const spaceIdx = body.indexOf(" ");
  const typed = spaceIdx === -1 ? body : body.slice(0, spaceIdx);
  const rawArgs = spaceIdx === -1 ? "" : body.slice(spaceIdx + 1);
  const q = typed.toLowerCase();

  const match = SLASH_COMMANDS.find(
    (cmd) => cmd.name === q || cmd.aliases.includes(q),
  );

  return match ? { command: match, rawArgs } : null;
}
