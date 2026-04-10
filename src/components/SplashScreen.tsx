import { motion } from "framer-motion";

export default function SplashScreen() {
  return (
    <motion.div
      key="splash"
      className="splash-screen"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.04 }}
      transition={{ duration: 0.45, ease: "easeInOut" }}
    >
      {/* Star icon */}
      <motion.div
        className="splash-icon"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="80"
          height="80"
          viewBox="0 0 512 512"
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
              <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.45" />
              <stop offset="50%" stopColor="#7c3aed" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#7c3aed" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="sp-core" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="white" stopOpacity="0.9" />
              <stop offset="30%" stopColor="#e9d5ff" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#c4b5fd" stopOpacity="0" />
            </radialGradient>
            <filter id="sp-blur" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="10" />
            </filter>
          </defs>
          <rect width="512" height="512" rx="92" fill="url(#sp-bg)" />
          <circle cx="256" cy="256" r="154" fill="url(#sp-glow)" />
          {/* 4-pointed star — shadow */}
          <polygon
            points="256,41 282,230 471,256 282,282 256,471 230,282 41,256 230,230"
            fill="#a78bfa"
            opacity="0.5"
            filter="url(#sp-blur)"
          />
          {/* 4-pointed star — main */}
          <polygon
            points="256,41 282,230 471,256 282,282 256,471 230,282 41,256 230,230"
            fill="url(#sp-star)"
          />
          {/* Core */}
          <circle cx="256" cy="256" r="31" fill="url(#sp-core)" />
          {/* Accent ring */}
          <circle
            cx="256"
            cy="256"
            r="113"
            fill="none"
            stroke="rgba(196, 181, 253, 0.15)"
            strokeWidth="1.5"
          />
        </svg>
      </motion.div>

      {/* App name */}
      <motion.p
        className="splash-title"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.15, ease: "easeOut" }}
      >
        Starfield
      </motion.p>

      {/* Subtle loading dot */}
      <motion.div
        className="splash-dot"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.6, 0] }}
        transition={{
          duration: 1.4,
          delay: 0.4,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
    </motion.div>
  );
}
