/**
 * Constellation Catalog — single source of truth for every constellation's
 * display metadata: name, description, accent colour, keyboard shortcut,
 * orbit parameters, and future-ready fields for grouping and search.
 *
 * This catalog drives the 3D atlas overlay, keyboard shortcut maps in
 * App.tsx, shortcut rows in Settings.tsx, and any future search or
 * grouping surface.  Adding a new constellation means adding one entry
 * here (plus a page component and an AppView union member).
 *
 * NOTE: This is presentation metadata only.  AI command handlers live in
 * `src/lib/constellations/` and are registered through the constellation
 * registry — there is no coupling between the two.
 */

import type { AppView } from "../store/useAppStore";
import type { LucideIcon } from "lucide-react";
import {
  ListTodo,
  CloudSun,
  FolderSearch,
  Link as LinkIcon,
  Download,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

export type ConstellationId = Exclude<AppView, "luna" | "settings">;

export interface ConstellationEntry {
  /** Must match the AppView route id. */
  id: ConstellationId;
  /** Human-readable name. */
  name: string;
  /** One-liner shown in the menu and cards. */
  description: string;
  /** Lucide icon component. */
  icon: LucideIcon;
  /** Primary accent colour (CSS rgba string). */
  accentColor: string;
  /** Hex colour for the 3D node emissive / glow. */
  glowHex: string;
  /** Keyboard shortcut digit (combined with Ctrl/Cmd). */
  shortcutNum: string;
  /** Orbit radius in the 3D scene (arbitrary units). */
  orbitRadius: number;
  /** Orbit speed multiplier (1 = default). */
  orbitSpeed: number;
  /** Starting angle on the orbit (radians). */
  orbitOffset: number;
  /** Vertical tilt of the orbit plane (radians). */
  orbitTilt: number;
  /** Planet sphere size multiplier (1 = default 0.3 radius). */
  planetSize: number;
  /** Optional group tag for future categorisation. */
  group?: string;
  /** Optional search aliases for future search. */
  aliases?: string[];
}

// ── Catalog ──────────────────────────────────────────────────────────────────

const TAU = Math.PI * 2;

export const CONSTELLATIONS: readonly ConstellationEntry[] = [
  {
    id: "orbit",
    name: "Orbit",
    description: "Tasks & notes that stay in formation.",
    icon: ListTodo,
    accentColor: "rgba(124, 79, 240, 0.55)",
    glowHex: "#7c4ff0",
    shortcutNum: "2",
    orbitRadius: 3.0,
    orbitSpeed: 1.25,
    orbitOffset: 0,
    orbitTilt: 0,
    planetSize: 1.15,
    group: "productivity",
    aliases: ["tasks", "notes", "todo"],
  },
  {
    id: "solaris",
    name: "Solaris",
    description: "Weather intelligence, solar-powered.",
    icon: CloudSun,
    accentColor: "rgba(217, 70, 239, 0.55)",
    glowHex: "#d946ef",
    shortcutNum: "3",
    orbitRadius: 5.2,
    orbitSpeed: 0.45,
    orbitOffset: TAU / 5,
    orbitTilt: 0,
    planetSize: 1.4,
    group: "intelligence",
    aliases: ["weather", "forecast"],
  },
  {
    id: "beacon",
    name: "Beacon",
    description: "Codebase exploration, lit from orbit.",
    icon: FolderSearch,
    accentColor: "rgba(99, 102, 241, 0.55)",
    glowHex: "#6366f1",
    shortcutNum: "4",
    orbitRadius: 7.8,
    orbitSpeed: 0.28,
    orbitOffset: (TAU / 5) * 2,
    orbitTilt: 0,
    planetSize: 0.85,
    group: "development",
    aliases: ["code", "explore", "project"],
  },
  {
    id: "hyperlane",
    name: "Hyperlane",
    description: "Links compressed into tiny jumps.",
    icon: LinkIcon,
    accentColor: "rgba(20, 184, 166, 0.55)",
    glowHex: "#14b8a6",
    shortcutNum: "5",
    orbitRadius: 6.4,
    orbitSpeed: 0.68,
    orbitOffset: (TAU / 5) * 3,
    orbitTilt: 0,
    planetSize: 0.95,
    group: "utility",
    aliases: ["url", "shorten", "link"],
  },
  {
    id: "pulsar",
    name: "Pulsar",
    description: "Media downloads with glow on demand.",
    icon: Download,
    accentColor: "rgba(155, 120, 248, 0.55)",
    glowHex: "#9b78f8",
    shortcutNum: "6",
    orbitRadius: 4.1,
    orbitSpeed: 1.05,
    orbitOffset: (TAU / 5) * 4,
    orbitTilt: 0,
    planetSize: 1.25,
    group: "media",
    aliases: ["download", "video", "music", "youtube"],
  },
] as const;

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Look up a catalog entry by id. */
export function getConstellation(
  id: ConstellationId,
): ConstellationEntry | undefined {
  return CONSTELLATIONS.find((c) => c.id === id);
}

/** Build the Ctrl/Cmd + number → AppView map used by keyboard shortcuts. */
export function buildShortcutMap(): Record<string, AppView> {
  const map: Record<string, AppView> = { "1": "luna" };
  for (const c of CONSTELLATIONS) {
    map[c.shortcutNum] = c.id;
  }
  return map;
}
