import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, Keyboard, ChevronRight } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import type { AppView } from "../store/useAppStore";
import {
  CONSTELLATIONS,
  type ConstellationId,
  type ConstellationEntry,
} from "../lib/constellation-catalog";
import { modLabel } from "../lib/platform";

// Lazy-load the 3D scene so the WebGL bundle is never on the critical path
const ConstellationAtlas3D = lazy(() => import("./ConstellationAtlas3D"));

// ── Detect whether we should skip WebGL ──────────────────────────────────────

function canUseWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// ── Variants ─────────────────────────────────────────────────────────────────

const shellVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      duration: 0.15,
      when: "beforeChildren" as const,
      staggerChildren: 0,
    },
  },
  exit: {
    opacity: 0,
    transition: {
      when: "afterChildren" as const,
      duration: 0.2,
    },
  },
};

const backdropVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.35, ease: "easeOut" as const },
  },
  exit: { opacity: 0, transition: { duration: 0.2, ease: "easeIn" as const } },
};

const surfaceVariants = {
  hidden: { opacity: 0, scale: 0.96, y: 14 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] as const },
  },
  exit: {
    opacity: 0,
    scale: 0.98,
    y: 8,
    transition: { duration: 0.25, ease: [0.4, 0, 1, 1] as const },
  },
};

const closeVariants = {
  hidden: { opacity: 0, scale: 0.84 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { delay: 0.15, duration: 0.2 },
  },
  exit: {
    opacity: 0,
    scale: 0.84,
    transition: { duration: 0.12 },
  },
};

const hudVariants = {
  hidden: { opacity: 0, x: -20 },
  visible: {
    opacity: 1,
    x: 0,
    transition: {
      delay: 0.3,
      duration: 0.4,
      ease: [0.22, 1, 0.36, 1] as const,
    },
  },
  exit: {
    opacity: 0,
    x: -10,
    transition: { duration: 0.15 },
  },
};

const infoVariants = {
  hidden: { opacity: 0, y: 12, scale: 0.96 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] as const },
  },
  exit: {
    opacity: 0,
    y: 8,
    scale: 0.97,
    transition: { duration: 0.18 },
  },
};

// ── HUD constellation card ───────────────────────────────────────────────────

function ConstellationCard({
  entry,
  isHovered,
  isActive,
  onHover,
  onClick,
  index,
}: {
  entry: ConstellationEntry;
  isHovered: boolean;
  isActive: boolean;
  onHover: (id: ConstellationId | null) => void;
  onClick: (id: ConstellationId) => void;
  index: number;
}) {
  const Icon = entry.icon;
  const highlighted = isHovered || isActive;

  return (
    <motion.button
      className={`cst-hud-card${highlighted ? " cst-hud-card-active" : ""}`}
      style={
        {
          "--card-accent": entry.glowHex,
          "--card-accent-rgb": hexToRgb(entry.glowHex),
        } as React.CSSProperties
      }
      initial={{ opacity: 0, x: -16, y: 4 }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      transition={{
        delay: 0.35 + index * 0.06,
        duration: 0.35,
        ease: [0.22, 1, 0.36, 1],
      }}
      onMouseEnter={() => onHover(entry.id)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onClick(entry.id)}
    >
      <div className="cst-hud-card-icon" style={{ color: entry.glowHex }}>
        <Icon size={16} />
      </div>
      <div className="cst-hud-card-info">
        <span className="cst-hud-card-name">{entry.name}</span>
        <span className="cst-hud-card-key">
          {modLabel}
          {entry.shortcutNum}
        </span>
      </div>
      {highlighted && (
        <motion.div
          className="cst-hud-card-arrow"
          initial={{ opacity: 0, x: -4 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.15 }}
        >
          <ChevronRight size={13} />
        </motion.div>
      )}
    </motion.button>
  );
}

// ── Focused info panel ───────────────────────────────────────────────────────

function InfoPanel({
  entry,
  onLaunch,
}: {
  entry: ConstellationEntry;
  onLaunch: () => void;
}) {
  const Icon = entry.icon;
  return (
    <motion.div
      className="cst-info-panel"
      style={
        {
          "--panel-accent": entry.glowHex,
          "--panel-accent-rgb": hexToRgb(entry.glowHex),
        } as React.CSSProperties
      }
      variants={infoVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      key={entry.id}
    >
      <div className="cst-info-icon">
        <Icon size={28} />
      </div>
      <h2 className="cst-info-title">{entry.name}</h2>
      <p className="cst-info-desc">{entry.description}</p>
      {entry.aliases && entry.aliases.length > 0 && (
        <div className="cst-info-tags">
          {entry.aliases.map((a) => (
            <span className="cst-info-tag" key={a}>
              {a}
            </span>
          ))}
        </div>
      )}
      <button className="cst-info-launch" onClick={onLaunch}>
        Launch
        <ChevronRight size={14} />
      </button>
    </motion.div>
  );
}

// ── Utility ──────────────────────────────────────────────────────────────────

function hexToRgb(hex: string): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}

// ── Overlay ──────────────────────────────────────────────────────────────────

export default function ConstellationOverlay() {
  const { view, closeConstellations, startWormhole } = useAppStore();
  const [hoveredId, setHoveredId] = useState<ConstellationId | null>(null);
  const [selectedId, setSelectedId] = useState<ConstellationId | null>(null);

  // Determine current active constellation (if any)
  const activeConstellation = useMemo<ConstellationId | null>(() => {
    const match = CONSTELLATIONS.find((c) => c.id === view);
    return match ? match.id : null;
  }, [view]);

  // The highlighted entry for the info panel (hover > selected > active)
  const focusedEntry = useMemo<ConstellationEntry | null>(() => {
    const id = hoveredId ?? selectedId ?? activeConstellation;
    if (!id) return null;
    return CONSTELLATIONS.find((c) => c.id === id) ?? null;
  }, [hoveredId, selectedId, activeConstellation]);

  // Feature detection (run once)
  const [use3D, setUse3D] = useState(true);
  useEffect(() => {
    if (!canUseWebGL() || prefersReducedMotion()) setUse3D(false);
  }, []);

  // Escape to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeConstellations();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeConstellations]);

  // Navigation handler — fires wormhole transition
  const navigate = useCallback(
    (id: ConstellationId) => {
      const entry = CONSTELLATIONS.find((c) => c.id === id);
      startWormhole(
        id as Exclude<AppView, "luna" | "settings">,
        entry?.glowHex ?? "#7c4ff0",
      );
    },
    [startWormhole],
  );

  // 3D scene hover sync
  const onSceneHover = useCallback((id: ConstellationId | null) => {
    setHoveredId(id);
  }, []);

  // 3D scene click — focus camera, persistently select the planet
  const onSceneFocus = useCallback((id: ConstellationId | null) => {
    setSelectedId(id);
  }, []);

  // Clean up cursor when overlay unmounts
  useEffect(() => {
    return () => {
      document.body.style.cursor = "auto";
    };
  }, []);

  return (
    <motion.div
      className="cst-shell above-stars"
      variants={shellVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      {/* Backdrop */}
      <motion.div
        className="cst-backdrop"
        variants={backdropVariants}
        onClick={closeConstellations}
      />

      {/* Scene surface */}
      <motion.div className="cst-surface" variants={surfaceVariants}>
        <div className="cst-surface-veil" />

        {/* Close button */}
        <motion.button
          className="cst-close-btn"
          variants={closeVariants}
          onClick={closeConstellations}
          aria-label="Close constellations"
        >
          <X size={18} />
        </motion.button>

        {/* HUD — left sidebar with constellation cards */}
        <motion.div className="cst-hud" variants={hudVariants}>
          <div className="cst-hud-header">
            <Keyboard size={13} className="cst-hud-header-icon" />
            <span>Constellations</span>
          </div>
          <div className="cst-hud-list">
            {CONSTELLATIONS.map((entry, i) => (
              <ConstellationCard
                key={entry.id}
                entry={entry}
                isHovered={hoveredId === entry.id}
                isActive={
                  activeConstellation === entry.id || selectedId === entry.id
                }
                onHover={setHoveredId}
                onClick={navigate}
                index={i}
              />
            ))}
          </div>
          <div className="cst-hud-hint">
            <span className="cst-hud-hint-key">Esc</span>
            <span>Close</span>
            <span className="cst-hud-hint-sep">·</span>
            <span className="cst-hud-hint-key">{modLabel}K</span>
            <span>Toggle</span>
          </div>
        </motion.div>

        {/* Info panel — bottom-right, shows focused constellation details */}
        <AnimatePresence mode="wait">
          {focusedEntry && (
            <InfoPanel
              key={focusedEntry.id}
              entry={focusedEntry}
              onLaunch={() => navigate(focusedEntry.id)}
            />
          )}
        </AnimatePresence>

        {/* 3D stage — fills the entire overlay */}
        {use3D && (
          <div className="cst-stage">
            <Suspense fallback={null}>
              <ConstellationAtlas3D
                activeView={selectedId ?? activeConstellation}
                onFocus={onSceneFocus}
                onHover={onSceneHover}
              />
            </Suspense>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
