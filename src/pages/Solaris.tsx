import { CloudSun, ArrowLeft } from "lucide-react";
import StarField from "../components/StarField";
import { useAppStore } from "../store/useAppStore";

export default function Solaris() {
  const { setView } = useAppStore();

  return (
    <div className="flex-1 flex flex-col min-h-0 relative overflow-hidden">
      <StarField />

      <div className="above-stars flex-1 flex flex-col min-h-0">
        {/* Header */}
        <div
          className="flex items-center gap-3 px-5 py-3"
          style={{ borderBottom: "1px solid var(--color-border-dim)" }}
        >
          <button className="win-btn" onClick={() => setView("home")} title="Back to Home">
            <ArrowLeft size={14} />
          </button>
          <CloudSun size={16} style={{ color: "var(--color-purple-400)" }} />
          <span className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
            Solaris
          </span>
          <span
            className="text-xs px-2 py-0.5 rounded"
            style={{
              background: "rgba(124, 79, 240, 0.12)",
              color: "var(--color-text-muted)",
            }}
          >
            constellation
          </span>
        </div>

        {/* Placeholder content */}
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center"
            style={{
              background: "rgba(124, 79, 240, 0.15)",
              border: "1px solid rgba(124, 79, 240, 0.25)",
            }}
          >
            <CloudSun size={32} style={{ color: "var(--color-purple-400)" }} />
          </div>
          <h2 className="text-2xl font-bold text-glow-purple" style={{ color: "var(--color-text-primary)" }}>
            Solaris
          </h2>
          <p className="text-sm text-center max-w-md" style={{ color: "var(--color-text-secondary)" }}>
            Weather intelligence — real-time forecasts, 7-day outlooks, and atmospheric insights powered by the
            sun itself. Ask Luna about the weather or explore Solaris directly.
          </p>
          <div
            className="glass rounded-xl px-5 py-3 text-xs flex items-center gap-2"
            style={{ color: "var(--color-text-muted)" }}
          >
            🚀 Coming soon — this constellation is being assembled
          </div>
        </div>
      </div>
    </div>
  );
}
