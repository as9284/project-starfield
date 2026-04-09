import { Minus, Maximize2, X, Star, Home } from "lucide-react";
import { minimizeWindow, maximizeWindow, closeWindow } from "../lib/tauri";
import { useAppStore } from "../store/useAppStore";

export default function TitleBar() {
  const { view, setView } = useAppStore();

  const isConstellation = view !== "home" && view !== "luna" && view !== "settings";

  return (
    <div className="topbar">
      {/* App identity */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <Star size={15} className="text-glow-star" style={{ color: "var(--color-purple-400)", fill: "var(--color-purple-400)" }} />
        <span className="text-sm font-semibold tracking-wide" style={{ color: "var(--color-text-primary)" }}>
          Starfield
        </span>
      </div>

      {/* Nav */}
      <nav className="topbar-nodrag flex items-center gap-1 text-xs">
        {(["home", "luna", "settings"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className="px-3 py-1 rounded-md transition-colors capitalize"
            style={{
              color:
                view === v || (v === "home" && isConstellation)
                  ? "var(--color-purple-400)"
                  : "var(--color-text-muted)",
              background:
                view === v || (v === "home" && isConstellation)
                  ? "rgba(124, 79, 240, 0.12)"
                  : "transparent",
            }}
          >
            {v === "home" ? (
              <span className="flex items-center gap-1">
                <Home size={11} />
                Home
              </span>
            ) : v === "luna" ? (
              "Luna"
            ) : (
              v.charAt(0).toUpperCase() + v.slice(1)
            )}
          </button>
        ))}
      </nav>

      {/* Window controls */}
      <div className="topbar-nodrag flex items-center gap-1 ml-4">
        <button className="win-btn win-btn-minimize" onClick={minimizeWindow} title="Minimize">
          <Minus size={12} />
        </button>
        <button className="win-btn win-btn-maximize" onClick={maximizeWindow} title="Maximize">
          <Maximize2 size={11} />
        </button>
        <button className="win-btn win-btn-close" onClick={closeWindow} title="Close">
          <X size={13} />
        </button>
      </div>
    </div>
  );
}
