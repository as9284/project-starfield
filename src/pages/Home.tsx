import { Sparkles, ListTodo, CloudSun, FolderSearch, Download, Link, Settings as SettingsIcon, Star } from "lucide-react";
import StarField from "../components/StarField";
import { useAppStore } from "../store/useAppStore";
import type { AppView } from "../store/useAppStore";

interface Constellation {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  view: AppView;
  available: boolean;
}

const CONSTELLATIONS: Constellation[] = [
  {
    id: "luna",
    name: "Luna",
    description:
      "Your central AI companion — ask anything, explore ideas, control every constellation, and get instant answers with live web search.",
    icon: <Sparkles size={28} />,
    view: "luna",
    available: true,
  },
  {
    id: "orbit",
    name: "Orbit",
    description:
      "Task management and notes — plan missions, track goals, and keep your ideas in orbit around what matters.",
    icon: <ListTodo size={28} />,
    view: "orbit",
    available: false,
  },
  {
    id: "solaris",
    name: "Solaris",
    description:
      "Weather intelligence — real-time forecasts, 7-day outlooks, and atmospheric insights powered by the sun.",
    icon: <CloudSun size={28} />,
    view: "solaris",
    available: false,
  },
  {
    id: "beacon",
    name: "Beacon",
    description:
      "Code explorer — import local folders, GitHub repos, and explore any codebase with Luna's AI guidance.",
    icon: <FolderSearch size={28} />,
    view: "beacon",
    available: false,
  },
  {
    id: "pulsar",
    name: "Pulsar",
    description:
      "Media downloader — grab videos, music, and playlists from YouTube with a single pulse.",
    icon: <Download size={28} />,
    view: "pulsar",
    available: false,
  },
  {
    id: "hyperlane",
    name: "Hyperlane",
    description:
      "URL shortener — collapse long links into compact, shareable hyperspace jumps in an instant.",
    icon: <Link size={28} />,
    view: "hyperlane",
    available: false,
  },
];

export default function Home() {
  const { setView, hasDeepSeekKey } = useAppStore();

  return (
    <div className="flex-1 flex flex-col min-h-0 relative overflow-hidden">
      <StarField />

      <div className="above-stars flex-1 flex flex-col items-center justify-center px-8 py-12 gap-10">
        {/* Hero */}
        <div className="text-center flex flex-col items-center gap-4 animate-fade-up">
          <div className="flex items-center justify-center w-16 h-16 rounded-2xl glass">
            <Star
              size={32}
              style={{
                color: "var(--color-purple-400)",
                fill: "var(--color-purple-400)",
              }}
              className="text-glow-star"
            />
          </div>
          <div>
            <h1
              className="text-4xl font-bold tracking-tight text-glow-purple"
              style={{ color: "var(--color-text-primary)" }}
            >
              Starfield
            </h1>
            <p className="mt-2 text-base" style={{ color: "var(--color-text-secondary)" }}>
              An AI‑powered universe of intelligent features, united by Luna.
            </p>
          </div>
        </div>

        {/* API key warning */}
        {!hasDeepSeekKey && (
          <div
            className="glass rounded-xl px-5 py-3 text-sm flex items-center gap-3 animate-fade-up"
            style={{ borderColor: "rgba(124, 79, 240, 0.35)", color: "var(--color-text-secondary)" }}
          >
            <SettingsIcon size={15} style={{ color: "var(--color-purple-400)", flexShrink: 0 }} />
            <span>
              Add your{" "}
              <button
                className="underline cursor-pointer"
                style={{ color: "var(--color-purple-400)", background: "none", border: "none" }}
                onClick={() => setView("settings")}
              >
                DeepSeek API key
              </button>{" "}
              in Settings to activate Luna.
            </span>
          </div>
        )}

        {/* Constellations grid */}
        <div className="w-full max-w-3xl grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-fade-up">
          {CONSTELLATIONS.map((c) => (
            <button
              key={c.id}
              className="constellation-card text-left"
              onClick={() => c.available && setView(c.view)}
              disabled={!c.available}
              style={{ opacity: c.available ? 1 : 0.45, cursor: c.available ? "pointer" : "default" }}
            >
              <div className="relative z-10 flex flex-col gap-3">
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center"
                  style={{
                    background: "rgba(124, 79, 240, 0.15)",
                    border: "1px solid rgba(124, 79, 240, 0.25)",
                    color: "var(--color-purple-400)",
                  }}
                >
                  {c.icon}
                </div>
                <div>
                  <p className="font-semibold text-sm" style={{ color: "var(--color-text-primary)" }}>
                    {c.name}
                    {!c.available && (
                      <span
                        className="ml-2 text-xs px-1.5 py-0.5 rounded"
                        style={{
                          background: "rgba(124, 79, 240, 0.12)",
                          color: "var(--color-text-muted)",
                        }}
                      >
                        soon
                      </span>
                    )}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
                    {c.description}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>

        <p className="text-xs" style={{ color: "var(--color-text-dim)" }}>
          v0.1.0
        </p>
      </div>
    </div>
  );
}
