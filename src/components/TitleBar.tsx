import { Minus, Maximize2, X, Sparkles, Settings2 } from "lucide-react";
import { minimizeWindow, maximizeWindow, closeWindow } from "../lib/tauri";
import { useAppStore } from "../store/useAppStore";
import { modLabel } from "../lib/platform";

export default function TitleBar() {
  const { view, setView, closeConstellations } = useAppStore();

  return (
    <div className="topbar">
      {/* App identity */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className="topbar-wordmark">Starfield</span>
      </div>

      {/* Nav */}
      <nav className="topbar-nodrag flex items-center gap-1">
        <button
          onClick={() => {
            closeConstellations();
            setView("luna");
          }}
          className={`topbar-nav-btn${view === "luna" ? " topbar-nav-btn-active" : ""}`}
          title={`Luna (${modLabel}1)`}
        >
          <Sparkles size={12} />
          Luna
        </button>

        <button
          onClick={() => {
            closeConstellations();
            setView("settings");
          }}
          className={`topbar-nav-btn${view === "settings" ? " topbar-nav-btn-active" : ""}`}
          title={`Settings (${modLabel},)`}
        >
          <Settings2 size={12} />
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
