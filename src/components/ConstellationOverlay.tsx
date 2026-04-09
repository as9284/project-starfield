import { useEffect } from "react";
import { motion } from "framer-motion";
import {
  CloudSun,
  Download,
  FolderSearch,
  Link as LinkIcon,
  ListTodo,
  Sparkles,
  X,
  type LucideIcon,
} from "lucide-react";
import { CosmicLogo } from "./CosmicLogo";
import { useAppStore } from "../store/useAppStore";
import type { AppView } from "../store/useAppStore";

type ConstellationView = Exclude<AppView, "luna" | "settings">;

interface ConstellationItem {
  id: ConstellationView;
  name: string;
  blurb: string;
  caption: string;
  icon: LucideIcon;
  top: string;
  left: string;
  path: string;
}

const CONSTELLATIONS: ConstellationItem[] = [
  {
    id: "orbit",
    name: "Orbit",
    blurb: "Tasks and notes that stay in formation.",
    caption: "Preview",
    icon: ListTodo,
    top: "22%",
    left: "18%",
    path: "M 50 50 C 44 41 33 31 19 22",
  },
  {
    id: "solaris",
    name: "Solaris",
    blurb: "Weather intelligence with some solar drama.",
    caption: "Preview",
    icon: CloudSun,
    top: "18%",
    left: "78%",
    path: "M 50 50 C 58 39 68 30 79 19",
  },
  {
    id: "beacon",
    name: "Beacon",
    blurb: "Codebase exploration, lit up from orbit.",
    caption: "Preview",
    icon: FolderSearch,
    top: "50%",
    left: "86%",
    path: "M 50 50 C 61 49 74 49 86 50",
  },
  {
    id: "hyperlane",
    name: "Hyperlane",
    blurb: "Links compressed into tiny jumps through space.",
    caption: "Preview",
    icon: LinkIcon,
    top: "79%",
    left: "70%",
    path: "M 50 50 C 58 58 64 69 71 79",
  },
  {
    id: "pulsar",
    name: "Pulsar",
    blurb: "Media downloads with more glow than restraint.",
    caption: "Preview",
    icon: Download,
    top: "80%",
    left: "28%",
    path: "M 50 50 C 43 58 36 69 28 80",
  },
];

export default function ConstellationOverlay() {
  const { closeConstellations, setView } = useAppStore();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeConstellations();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeConstellations]);

  const openConstellation = (view: ConstellationView) => {
    setView(view);
  };

  return (
    <div className="constellation-overlay-shell above-stars">
      <motion.div
        className="constellation-overlay-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={closeConstellations}
      />

      <motion.section
        className="constellation-overlay-panel glass"
        initial={{ opacity: 0, y: 22, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 18, scale: 0.985 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
      >
        <div className="constellation-overlay-header">
          <div>
            <p className="constellation-eyebrow">Starfield Atlas</p>
            <h2 className="constellation-title">Constellations</h2>
            <p className="constellation-subtitle">
              Luna stays at the core. The rest of the universe branches off from
              here.
            </p>
          </div>

          <button
            className="win-btn"
            type="button"
            onClick={closeConstellations}
            title="Close constellations"
          >
            <X size={14} />
          </button>
        </div>

        <div className="constellation-stage">
          <motion.svg
            className="constellation-links"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient
                id="constellation-link-gradient"
                x1="0%"
                y1="0%"
                x2="100%"
                y2="100%"
              >
                <stop offset="0%" stopColor="rgba(124, 79, 240, 0.12)" />
                <stop offset="50%" stopColor="rgba(217, 70, 239, 0.7)" />
                <stop offset="100%" stopColor="rgba(99, 102, 241, 0.16)" />
              </linearGradient>
            </defs>

            {CONSTELLATIONS.map((item, index) => (
              <motion.path
                key={item.id}
                d={item.path}
                fill="none"
                stroke="url(#constellation-link-gradient)"
                strokeWidth="0.35"
                strokeLinecap="round"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 0.9 }}
                transition={{ duration: 0.55, delay: 0.08 + index * 0.06 }}
              />
            ))}
          </motion.svg>

          <div className="constellation-core">
            <div className="constellation-core-logo">
              <CosmicLogo size={78} />
            </div>
            <div className="constellation-core-copy">
              <span className="constellation-core-label">Luna Core</span>
              <span className="constellation-core-note">
                Chat-first command bridge
              </span>
            </div>
          </div>

          {CONSTELLATIONS.map((item, index) => {
            const Icon = item.icon;

            return (
              <motion.button
                key={item.id}
                type="button"
                className="constellation-node"
                style={{ top: item.top, left: item.left }}
                initial={{ opacity: 0, y: 12, scale: 0.94 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.24, delay: 0.16 + index * 0.05 }}
                whileHover={{ y: -4, scale: 1.03 }}
                whileTap={{ scale: 0.985 }}
                onClick={() => openConstellation(item.id)}
              >
                <span className="constellation-node-orb">
                  <Icon size={17} />
                </span>
                <span className="constellation-node-name">{item.name}</span>
                <span className="constellation-node-caption">
                  {item.caption}
                </span>
                <span className="constellation-node-blurb">{item.blurb}</span>
              </motion.button>
            );
          })}
        </div>

        <div className="constellation-mobile-list">
          {CONSTELLATIONS.map((item, index) => {
            const Icon = item.icon;

            return (
              <motion.button
                key={`${item.id}-mobile`}
                type="button"
                className="constellation-mobile-item"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22, delay: 0.12 + index * 0.04 }}
                onClick={() => openConstellation(item.id)}
              >
                <span className="constellation-mobile-icon">
                  <Icon size={16} />
                </span>
                <span className="constellation-mobile-copy">
                  <span className="constellation-mobile-name-row">
                    <span className="constellation-mobile-name">
                      {item.name}
                    </span>
                    <span className="constellation-node-caption">
                      {item.caption}
                    </span>
                  </span>
                  <span className="constellation-mobile-blurb">
                    {item.blurb}
                  </span>
                </span>
              </motion.button>
            );
          })}
        </div>

        <div className="constellation-overlay-footer">
          <Sparkles size={13} />
          <span>
            Everything routes back through Luna. Efficient. Slightly ominous.
            Very on-brand.
          </span>
        </div>
      </motion.section>
    </div>
  );
}
