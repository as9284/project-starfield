import { Minus, Maximize2, X } from "lucide-react";
import { minimizeWindow, maximizeWindow, closeWindow } from "../lib/tauri";
import { useAppStore } from "../store/useAppStore";
import { CosmicLogoMini } from "./CosmicLogo";

export default function TitleBar() {
  const {
    view,
    setView,
    closeConstellations,
  } = useAppStore();

  return (
    <div className="topbar">
      {/* App identity */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <CosmicLogoMini size={15} />
        <span
          className="text-sm font-semibold tracking-wide"
          style={{ color: "var(--color-text-primary)" }}
        >
          Starfield
        </span>
      </div>

      {/* Nav */}
      <nav className="topbar-nodrag flex items-center gap-1 text-xs">
        <button
          onClick={() => {
            closeConstellations();
            setView("luna");
          }}
          className="px-3 py-1 rounded-md transition-colors"
          style={{
            color:
              view === "luna"
                ? "var(--color-purple-400)"
                : "var(--color-text-muted)",
            background:
              view === "luna"
                ? "rgba(124, 79, 240, 0.12)"
                : "transparent",
          }}
        >
          Luna
        </button>

        <button
          onClick={() => {
            closeConstellations();
            setView("settings");
          }}
          className="px-3 py-1 rounded-md transition-colors"
          style={{
            color:
              view === "settings"
                ? "var(--color-purple-400)"
                : "var(--color-text-muted)",
            background:
              view === "settings" ? "rgba(124, 79, 240, 0.12)" : "transparent",
          }}
        >
          Settings
        </button>
      </nav>

      {/* Window controls */}
      <div className="topbar-nodrag flex items-center gap-1 ml-4">
        <button
          className="win-btn win-btn-minimize"
          onClick={minimizeWindow}
          title="Minimize"
        >
          <Minus size={12} />
        </button>
        <button
          className="win-btn win-btn-maximize"
          onClick={maximizeWindow}
          title="Maximize"
        >
          <Maximize2 size={11} />
        </button>
        <button
          className="win-btn win-btn-close"
          onClick={closeWindow}
          title="Close"
        >
          <X size={13} />
        </button>
      </div>
    </div>
  );
}
