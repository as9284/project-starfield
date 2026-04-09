import { Link, ArrowLeft } from "lucide-react";
import StarField from "../components/StarField";
import { useAppStore } from "../store/useAppStore";

export default function Hyperlane() {
  const { goBack } = useAppStore();

  return (
    <div className="flex-1 flex flex-col min-h-0 relative overflow-hidden">
      <StarField />

      <div className="above-stars flex-1 flex flex-col min-h-0">
        {/* Header */}
        <div
          className="flex items-center gap-3 px-5 py-3"
          style={{ borderBottom: "1px solid var(--color-border-dim)" }}
        >
          <button
            className="win-btn"
            onClick={goBack}
            title="Back"
          >
            <ArrowLeft size={14} />
          </button>
          <Link size={16} style={{ color: "var(--color-purple-400)" }} />
          <span
            className="text-sm font-semibold"
            style={{ color: "var(--color-text-primary)" }}
          >
            Hyperlane
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
            <Link size={32} style={{ color: "var(--color-purple-400)" }} />
          </div>
          <h2
            className="text-2xl font-bold text-glow-purple"
            style={{ color: "var(--color-text-primary)" }}
          >
            Hyperlane
          </h2>
          <p
            className="text-sm text-center max-w-md"
            style={{ color: "var(--color-text-secondary)" }}
          >
            URL shortener — collapse long links into compact, shareable
            hyperspace jumps. Ask Luna to shorten a URL or manage your link
            history directly in Hyperlane.
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
