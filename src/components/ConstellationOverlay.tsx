import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import type { AppView } from "../store/useAppStore";
import {
  CONSTELLATIONS,
  type ConstellationId,
} from "../lib/constellation-catalog";

// Lazy-load the 3D scene so the WebGL bundle is never on the critical path
const ConstellationAtlas3D = lazy(() => import("./ConstellationAtlas3D"));

type ConstellationView = Exclude<AppView, "luna" | "settings">;

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
// Using a single variant tree so Framer Motion orchestrates all children as
// one coordinated timeline instead of independent, potentially de-synced
// animations. This keeps the backdrop fade and scene entrance aligned.

const shellVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      duration: 0.18,
      when: "beforeChildren" as const,
      staggerChildren: 0,
    },
  },
  exit: {
    opacity: 0,
    transition: {
      when: "afterChildren" as const,
      duration: 0.22,
    },
  },
};

const backdropVariants = {
  // Fade the dark backdrop without introducing extra backdrop processing.
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.4, ease: "easeOut" as const },
  },
  exit: { opacity: 0, transition: { duration: 0.25, ease: "easeIn" as const } },
};

const surfaceVariants = {
  hidden: { opacity: 0, scale: 0.965, y: 18 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.42, ease: [0.22, 1, 0.36, 1] as const },
  },
  exit: {
    opacity: 0,
    scale: 0.98,
    y: 10,
    transition: { duration: 0.28, ease: [0.4, 0, 1, 1] as const },
  },
};

const closeVariants = {
  hidden: { opacity: 0, scale: 0.84 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { delay: 0.2, duration: 0.22 },
  },
  exit: {
    opacity: 0,
    scale: 0.84,
    transition: { duration: 0.15 },
  },
};

// ── Overlay ──────────────────────────────────────────────────────────────────

export default function ConstellationOverlay() {
  const { view, closeConstellations, setView } = useAppStore();

  // Determine current active constellation (if any)
  const activeConstellation = useMemo<ConstellationId | null>(() => {
    const match = CONSTELLATIONS.find((c) => c.id === view);
    return match ? match.id : null;
  }, [view]);

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

  // Navigation handler
  const navigate = useCallback(
    (id: ConstellationId) => {
      setView(id as ConstellationView);
    },
    [setView],
  );

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
      {/* Backdrop — keep it darker without blurring the app underneath */}
      <motion.div
        className="cst-backdrop"
        variants={backdropVariants}
        onClick={closeConstellations}
      />

      {/* Scene surface — scales in independently */}
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

        {/* 3D stage — fills the entire overlay */}
        {use3D && (
          <div className="cst-stage">
            <Suspense fallback={null}>
              <ConstellationAtlas3D
                activeView={activeConstellation}
                onSelect={navigate}
              />
            </Suspense>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
