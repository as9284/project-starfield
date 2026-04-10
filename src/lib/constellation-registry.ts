/**
 * Constellation Registry — the backbone of Luna's control over every feature.
 *
 * Each constellation registers a handler that teaches Luna how to:
 *  1. Describe its commands in the system prompt
 *  2. Provide live state context for the prompt
 *  3. Execute commands parsed from Luna's responses
 *  4. Render inline action-result cards in the chat
 *
 * Adding a new constellation to Luna requires only:
 *  - Creating a handler file in `src/lib/constellations/`
 *  - Adding it to the handlers array in `src/lib/constellations/index.ts`
 */

import type { ComponentType } from "react";

// ── Types ────────────────────────────────────────────────────────────────────

export interface ParsedCommand {
  command: string;
  args: Record<string, unknown>;
}

/**
 * A result produced by a constellation handler after executing commands.
 * `type` is a handler-specific discriminator (e.g. "weather", "orbit_done").
 * `handler` is the tag of the handler that produced this result.
 */
export interface ActionResult {
  type: string;
  handler: string;
  [key: string]: unknown;
}

export interface ConstellationHandler {
  /** Fenced-code tag for command blocks, e.g. "orbit-commands" */
  tag: string;

  /** Human-readable name shown in cards */
  name: string;

  /** Whether multiple commands per block are allowed */
  multiCommand: boolean;

  /** Markdown section appended to Luna's system prompt describing available commands */
  promptInstructions: string;

  /**
   * Build a dynamic context string injected into the system prompt.
   * Return an empty string when there is nothing noteworthy to report.
   */
  buildContext: () => string;

  /**
   * Execute parsed commands and return action results.
   * Called once per response, only when at least one command was parsed.
   */
  execute: (commands: ParsedCommand[]) => Promise<ActionResult[]>;

  /**
   * React component that renders an inline card for this handler's results.
   * Receives a single `result` and an optional `onNavigate` callback.
   */
  ResultCard: ComponentType<{
    result: ActionResult;
    onNavigate?: (view: string) => void;
  }>;
}

// ── Shared utility ───────────────────────────────────────────────────────────

/** Strip control characters and backtick sequences to prevent prompt injection. */
export function sanitizeForPrompt(text: string, maxLen = 120): string {
  return text
    .replace(/[\x00-\x1f\x7f]/g, " ")
    .replace(/`{3,}/g, "```")
    .slice(0, maxLen);
}

// ── Parse helpers ────────────────────────────────────────────────────────────

function getCommandBlockBody(response: string, tag: string): string | null {
  const re = new RegExp("```" + tag + "\\r?\\n([\\s\\S]*?)(?:```|$)", "i");
  const match = response.match(re);
  return match?.[1] ?? null;
}

/**
 * Parse commands from a fenced code block in an LLM response.
 * If `multi` is true, every non-empty line is treated as a separate command.
 */
export function parseCommands(
  response: string,
  tag: string,
  multi: boolean,
): ParsedCommand[] {
  const body = getCommandBlockBody(response, tag);
  if (!body) return [];

  const lines = multi
    ? body.trim().split("\n")
    : [body.trim().split("\n")[0]];

  return lines.flatMap((line) => {
    const trimmed = line.trim();
    if (!trimmed) return [];
    const spaceIdx = trimmed.indexOf(" ");
    const command = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
    const jsonStr = spaceIdx === -1 ? "{}" : trimmed.slice(spaceIdx + 1);
    try {
      return [
        { command, args: JSON.parse(jsonStr) as Record<string, unknown> },
      ];
    } catch {
      return [];
    }
  });
}

/**
 * Remove all known command blocks from assistant content so they are never
 * shown in the chat UI. Also strips partially-typed opening fences that
 * appear during streaming.
 */
export function stripCommandBlocks(
  content: string,
  handlers: readonly ConstellationHandler[],
): string {
  let cleaned = content;
  for (const { tag } of handlers) {
    const re = new RegExp(
      "\\s*```" + tag + "\\r?\\n[\\s\\S]*?(?:```|$)",
      "gi",
    );
    cleaned = cleaned.replace(re, "");
  }

  // Strip a trailing partial opening fence during streaming
  const match = cleaned.match(/\s*```([a-z-]*)$/i);
  if (match) {
    const partial = (match[1] ?? "").toLowerCase();
    if (
      partial.length === 0 ||
      handlers.some(({ tag }) => tag.startsWith(partial))
    ) {
      cleaned = cleaned.slice(0, cleaned.length - match[0].length).trimEnd();
    }
  }

  return cleaned.trimEnd();
}

/** Quick check whether the response contains any known command block. */
export function hasCommandBlocks(
  content: string,
  handlers: readonly ConstellationHandler[],
): boolean {
  const lower = content.toLowerCase();
  return handlers.some(({ tag }) => lower.includes("```" + tag));
}
