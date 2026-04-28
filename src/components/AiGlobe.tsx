import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useAppStore } from "../store/useAppStore";

interface AiGlobeProps {
  size?: number;
  className?: string;
}

const prefersReducedMotion = typeof window !== "undefined"
  ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
  : false;

export function AiGlobe({ size = 320, className }: AiGlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const performanceMode = useAppStore((s) => s.performanceMode);
  const shouldReduceMotion = prefersReducedMotion || performanceMode;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function onMouseMove(e: MouseEvent) {
      const rect = el?.getBoundingClientRect();
      if (!rect) return;
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = (e.clientX - cx) / (rect.width / 2);
      const dy = (e.clientY - cy) / (rect.height / 2);
      setTilt({ x: dy * -6, y: dx * 6 });
    }

    function onMouseLeave() {
      setTilt({ x: 0, y: 0 });
    }

    el.addEventListener("mousemove", onMouseMove);
    el.addEventListener("mouseleave", onMouseLeave);
    return () => {
      el.removeEventListener("mousemove", onMouseMove);
      el.removeEventListener("mouseleave", onMouseLeave);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={`relative flex items-center justify-center select-none${className ? ` ${className}` : ""}`}
      style={{ width: size, height: size, perspective: "600px" }}
    >
      {/* Outer Ambient Glow */}
      <motion.div
        className="absolute rounded-full"
        style={{
          inset: "-15%",
          background:
            "radial-gradient(circle, rgba(144,102,255,0.22) 0%, rgba(90,160,255,0.1) 40%, transparent 65%)",
          zIndex: 0,
        }}
        animate={{
          scale: [1, 1.05, 1],
          opacity: [0.5, 0.7, 0.5],
        }}
        transition={{
          duration: 4,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      {/* Second ambient glow layer — mouse responsive */}
      <motion.div
        className="absolute rounded-full"
        style={{
          inset: "-8%",
          background:
            "radial-gradient(circle at 55% 45%, rgba(124,79,240,0.15) 0%, transparent 60%)",
          zIndex: 0,
        }}
        animate={{
          x: tilt.y * 1.5,
          y: tilt.x * 1.5,
        }}
        transition={{ type: "spring", stiffness: 80, damping: 20 }}
      />

      {/* Tilted group for parallax */}
      <motion.div
        className="absolute inset-0 flex items-center justify-center"
        style={{ zIndex: 1, transformStyle: "preserve-3d" }}
        animate={{
          rotateX: tilt.x,
          rotateY: tilt.y,
        }}
        transition={{ type: "spring", stiffness: 100, damping: 18 }}
      >
        {/* Smooth Gas Giant Core */}
        <motion.div
          className="absolute rounded-full overflow-hidden"
          style={{
            width: "60%",
            height: "60%",
            background:
              "radial-gradient(circle at 35% 35%, #7e55ed 0%, #361f82 45%, #0d091a 100%)",
            boxShadow:
              "inset -12px -12px 32px rgba(0,0,0,0.8), inset 6px 6px 20px rgba(220,190,255,0.25), 0 0 40px rgba(130,90,255,0.2), 0 0 80px rgba(124,79,240,0.1)",
          }}
        >
          {/* Surface Atmospheric Texture */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.025' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
              mixBlendMode: "overlay",
              opacity: 0.4,
            }}
          />

          {/* Soft rotating atmospheric swirls */}
          <motion.div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse at 70% 30%, rgba(140, 100, 255, 0.2) 0%, transparent 50%), radial-gradient(ellipse at 30% 70%, rgba(80, 140, 255, 0.15) 0%, transparent 50%)",
              mixBlendMode: "screen",
              opacity: 0.6,
            }}
            animate={{ rotate: [0, 360] }}
            transition={{ duration: 40, repeat: Infinity, ease: "linear" }}
          />

          {/* Core Brightness pulse */}
          <motion.div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(circle at 40% 40%, rgba(220, 200, 255, 0.4) 0%, transparent 60%)",
              mixBlendMode: "screen",
            }}
            animate={{
              opacity: [0.15, 0.35, 0.15],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        </motion.div>

        {/* Primary Orbital Ring */}
        <motion.div
          className="absolute rounded-full origin-center"
          style={{
            width: "100%",
            height: "100%",
            background:
              "conic-gradient(from 214deg, rgba(110, 84, 235, 0) 0deg, rgba(110, 84, 235, 0.1) 36deg, rgba(168, 128, 255, 0.9) 118deg, rgba(94, 182, 255, 0.62) 196deg, rgba(110, 84, 235, 0.18) 244deg, rgba(110, 84, 235, 0) 318deg, rgba(182, 144, 255, 0.72) 360deg)",
            WebkitMask:
              "radial-gradient(farthest-side, transparent calc(100% - 5px), #000 calc(100% - 2px))",
            mask: "radial-gradient(farthest-side, transparent calc(100% - 5px), #000 calc(100% - 2px))",
            boxShadow:
              "0 0 18px rgba(150, 120, 255, 0.2), inset 0 0 12px rgba(150, 120, 255, 0.08)",
            zIndex: 2,
          }}
          animate={
            shouldReduceMotion
              ? { opacity: 0.8 }
              : { rotate: [0, 360], opacity: 0.8 }
          }
          transition={
            shouldReduceMotion
              ? { opacity: { duration: 2 } }
              : { rotate: { duration: 26, repeat: Infinity, ease: "linear" } }
          }
        />

        {/* Secondary Counter-rotating Orbit */}
        <motion.div
          className="absolute rounded-full origin-center"
          style={{
            width: "115%",
            height: "115%",
            background:
              "conic-gradient(from 20deg, rgba(126, 98, 255, 0) 0deg, rgba(126, 98, 255, 0) 86deg, rgba(182, 150, 255, 0.78) 146deg, rgba(104, 182, 255, 0.3) 202deg, rgba(126, 98, 255, 0.14) 248deg, rgba(126, 98, 255, 0) 320deg, rgba(126, 98, 255, 0) 360deg)",
            WebkitMask:
              "radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 2px))",
            mask: "radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 2px))",
            boxShadow: "0 0 12px rgba(112, 164, 255, 0.14)",
            zIndex: 2,
          }}
          animate={
            shouldReduceMotion
              ? { opacity: 0.7 }
              : { rotate: [360, 0], opacity: 0.7 }
          }
          transition={
            shouldReduceMotion
              ? { opacity: { duration: 2 } }
              : { rotate: { duration: 35, repeat: Infinity, ease: "linear" } }
          }
        />


      </motion.div>
    </div>
  );
}
