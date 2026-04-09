import { useEffect } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  CloudSun,
  Download,
  FolderSearch,
  Link as LinkIcon,
  ListTodo,
  X,
  type LucideIcon,
} from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import type { AppView } from "../store/useAppStore";
import { modLabel } from "../lib/platform";

type ConstellationView = Exclude<AppView, "luna" | "settings">;

interface ConstellationItem {
  id: ConstellationView;
  name: string;
  description: string;
  icon: LucideIcon;
  accentColor: string;
  shortcutNum: string;
}

const CONSTELLATIONS: ConstellationItem[] = [
  {
    id: "orbit",
    name: "Orbit",
    description: "Tasks & notes that stay in formation.",
    icon: ListTodo,
    accentColor: "rgba(124, 79, 240, 0.55)",
    shortcutNum: "2",
  },
  {
    id: "solaris",
    name: "Solaris",
    description: "Weather intelligence, solar-powered.",
    icon: CloudSun,
    accentColor: "rgba(217, 70, 239, 0.55)",
    shortcutNum: "3",
  },
  {
    id: "beacon",
    name: "Beacon",
    description: "Codebase exploration, lit from orbit.",
    icon: FolderSearch,
    accentColor: "rgba(99, 102, 241, 0.55)",
    shortcutNum: "4",
  },
  {
    id: "hyperlane",
    name: "Hyperlane",
    description: "Links compressed into tiny jumps.",
    icon: LinkIcon,
    accentColor: "rgba(20, 184, 166, 0.55)",
    shortcutNum: "5",
  },
  {
    id: "pulsar",
    name: "Pulsar",
    description: "Media downloads with glow on demand.",
    icon: Download,
    accentColor: "rgba(155, 120, 248, 0.55)",
    shortcutNum: "6",
  },
];

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.1 },
  },
  exit: { opacity: 0, transition: { duration: 0.15 } },
};

const cardVariant = {
  hidden: { opacity: 0, y: 16, scale: 0.97 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.3, ease: "easeOut" as const } },
};

export default function ConstellationOverlay() {
  const { closeConstellations, setView } = useAppStore();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeConstellations();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeConstellations]);

  const open = (view: ConstellationView) => setView(view);

  return (
    <div className="cst-shell above-stars">
      <motion.div
        className="cst-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={closeConstellations}
      />

      <motion.section
        className="cst-panel"
        variants={container}
        initial="hidden"
        animate="show"
        exit="exit"
      >
        {/* Header */}
        <div className="cst-header">
          <div>
            <h2 className="cst-title">Constellations</h2>
            <p className="cst-subtitle">
              Everything branches off from Luna.
            </p>
          </div>
          <button
            className="win-btn"
            type="button"
            onClick={closeConstellations}
            title="Close"
          >
            <X size={14} />
          </button>
        </div>

        {/* Grid */}
        <motion.div className="cst-grid" variants={container}>
          {CONSTELLATIONS.map((item) => {
            const Icon = item.icon;
            return (
              <motion.button
                key={item.id}
                type="button"
                className="cst-card group"
                variants={cardVariant}
                whileHover={{ y: -3, scale: 1.015 }}
                whileTap={{ scale: 0.985 }}
                onClick={() => open(item.id)}
              >
                <span
                  className="cst-card-glow"
                  style={{ background: item.accentColor }}
                />
                <span className="cst-card-icon">
                  <Icon size={20} />
                </span>
                <span className="cst-card-body">
                  <span className="cst-card-name">{item.name}</span>
                  <span className="cst-card-desc">{item.description}</span>
                </span>
                <kbd
                  className="text-xs font-mono px-1.5 py-0.5 rounded shrink-0 opacity-0 group-hover:opacity-100 transition-opacity hidden sm:inline-block"
                  style={{
                    background: "rgba(124, 79, 240, 0.08)",
                    border: "1px solid rgba(124, 79, 240, 0.15)",
                    color: "var(--color-text-dim)",
                    fontSize: "0.65rem",
                  }}
                  title={`${modLabel}${item.shortcutNum}`}
                >
                  {modLabel}{item.shortcutNum}
                </kbd>
                <ArrowRight size={14} className="cst-card-arrow" />
              </motion.button>
            );
          })}
        </motion.div>
      </motion.section>
    </div>
  );
}
