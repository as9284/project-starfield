import { motion } from "framer-motion";

/* ── starfield particles ────────────────────────────────────────────────── */
const PARTICLES = Array.from({ length: 24 }, (_, i) => ({
  id: i,
  size: Math.random() * 2 + 1,
  left: `${Math.random() * 100}%`,
  top: `${Math.random() * 100}%`,
  duration: Math.random() * 3 + 2,
  delay: Math.random() * 2,
}));

export default function SplashScreen() {
  return (
    <motion.div
      key="splash"
      className="splash-screen"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.03 }}
      transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
    >
      {/* Ambient nebula glow */}
      <div className="splash-nebula" />

      {/* Floating starfield */}
      <div className="splash-stars" aria-hidden="true">
        {PARTICLES.map((p) => (
          <div
            key={p.id}
            className="splash-star"
            style={{
              width: p.size,
              height: p.size,
              left: p.left,
              top: p.top,
              animationDuration: `${p.duration}s`,
              animationDelay: `${p.delay}s`,
            }}
          />
        ))}
      </div>

      {/* Orbital ring */}
      <motion.div
        className="splash-orbit"
        initial={{ opacity: 0, rotate: -30 }}
        animate={{ opacity: 1, rotate: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
      />

      {/* Star icon */}
      <motion.div
        className="splash-icon-wrap"
        initial={{ opacity: 0, scale: 0.7, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="splash-icon-glow" />
        <motion.div
          animate={{ y: [0, -6, 0] }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="72"
            height="72"
            viewBox="0 0 512 512"
            className="splash-icon"
          >
            <defs>
              <radialGradient id="sp-bg" cx="50%" cy="45%" r="70%">
                <stop offset="0%" stopColor="#5b21b6" />
                <stop offset="55%" stopColor="#3b0764" />
                <stop offset="100%" stopColor="#200840" />
              </radialGradient>
              <linearGradient id="sp-star" x1="20%" y1="0%" x2="80%" y2="100%">
                <stop offset="0%" stopColor="#f5f3ff" />
                <stop offset="45%" stopColor="#ddd6fe" />
                <stop offset="100%" stopColor="#a78bfa" />
              </linearGradient>
              <radialGradient id="sp-glow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.5" />
                <stop offset="50%" stopColor="#7c3aed" stopOpacity="0.2" />
                <stop offset="100%" stopColor="#7c3aed" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="sp-core" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="white" stopOpacity="0.95" />
                <stop offset="30%" stopColor="#e9d5ff" stopOpacity="0.6" />
                <stop offset="100%" stopColor="#c4b5fd" stopOpacity="0" />
              </radialGradient>
              <filter
                id="sp-blur"
                x="-50%"
                y="-50%"
                width="200%"
                height="200%"
              >
                <feGaussianBlur in="SourceGraphic" stdDeviation="10" />
              </filter>
            </defs>
            <rect width="512" height="512" rx="92" fill="url(#sp-bg)" />
            <circle cx="256" cy="256" r="154" fill="url(#sp-glow)" />
            <polygon
              points="256,41 282,230 471,256 282,282 256,471 230,282 41,256 230,230"
              fill="#a78bfa"
              opacity="0.5"
              filter="url(#sp-blur)"
            />
            <polygon
              points="256,41 282,230 471,256 282,282 256,471 230,282 41,256 230,230"
              fill="url(#sp-star)"
            />
            <circle cx="256" cy="256" r="31" fill="url(#sp-core)" />
            <circle
              cx="256"
              cy="256"
              r="113"
              fill="none"
              stroke="rgba(196, 181, 253, 0.2)"
              strokeWidth="1.5"
            />
          </svg>
        </motion.div>
      </motion.div>

      {/* App name */}
      <motion.div
        className="splash-text"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.15, ease: "easeOut" }}
      >
        <p className="splash-title">Starfield</p>
        <p className="splash-subtitle">Explore the cosmos</p>
      </motion.div>

      {/* Wave loader */}
      <motion.div
        className="splash-loader"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4, duration: 0.4 }}
      >
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="splash-loader-dot"
            animate={{ y: [0, -6, 0], opacity: [0.4, 1, 0.4] }}
            transition={{
              duration: 1.2,
              repeat: Infinity,
              delay: i * 0.15,
              ease: "easeInOut",
            }}
          />
        ))}
      </motion.div>
    </motion.div>
  );
}
