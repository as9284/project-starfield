/**
 * WormholeTransition — full-screen canvas animation that plays when a
 * constellation is launched. Renders via a React portal so it persists above
 * everything, including after the ConstellationOverlay unmounts.
 *
 * Timeline (total ~1 800 ms):
 *   t 0.00–0.06  canvas fades in (enterAlpha ramp)
 *   t 0.00–0.30  wormhole mouth opens, rings expand from centre
 *   t 0.30–0.55  acceleration — rings speed up, star streaks lengthen
 *   t 0.46–0.54  white flash builds, peaks at ~0.54
 *   t 0.55       onNavigate fires (page switches behind the flash)
 *   t 0.54–0.72  flash dissolves
 *   t 0.58–1.00  internal elements decelerate and fade
 *   t 0.62–1.00  canvas dissolveAlpha ramp → smooth reveal of destination
 *   t 1.00       onDone fires (overlay already fully transparent)
 */

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";

interface WormholeTransitionProps {
  accentHex: string;
  /** Called at ~62 % to trigger setView + closeConstellations behind the flash. */
  onNavigate: () => void;
  /** Called when the full animation is complete so the overlay can be removed. */
  onDone: () => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const c = hex.replace("#", "");
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return [isNaN(r) ? 124 : r, isNaN(g) ? 79 : g, isNaN(b) ? 240 : b];
}

function easeInQuart(t: number) {
  return t * t * t * t;
}

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// ── Constants ────────────────────────────────────────────────────────────────

const DURATION = 1800; // ms
const NAVIGATE_AT = 0.55; // fraction of DURATION
const RING_COUNT = 22;
const STAR_COUNT = 110;

// ── Seeded ring / star data (stable across re-renders) ───────────────────────

interface RingData {
  phaseOffset: number;
  ellipseRatio: number;
  tiltAngle: number;
  rotSpeed: number;
  segments: number;
  segGap: number;
}

interface StarData {
  angle: number;
  startRadius: number; // normalised 0..1 relative to maxR
  speed: number;
  streakLen: number;
  size: number;
  phase: number;
}

function buildRings(): RingData[] {
  // Use deterministic-ish values rather than Math.random so HMR doesn't reseed
  return Array.from({ length: RING_COUNT }, (_, i) => {
    const f = i / RING_COUNT;
    return {
      phaseOffset: f,
      ellipseRatio: 0.38 + ((i * 7) % 11) * 0.018,
      tiltAngle: (((i * 13) % 17) - 8) * 0.05,
      rotSpeed: (((i * 5) % 9) - 4) * 0.04,
      segments: 10 + ((i * 3) % 8),
      segGap: 0.25 + ((i * 11) % 9) * 0.04,
    };
  });
}

function buildStars(): StarData[] {
  return Array.from({ length: STAR_COUNT }, (_, i) => {
    const f = i / STAR_COUNT;
    return {
      angle: f * Math.PI * 2 + ((i * 7) % 13) * 0.1,
      startRadius: 0.04 + ((i * 11) % 17) * 0.018,
      speed: 0.35 + ((i * 3) % 7) * 0.09,
      streakLen: 0.06 + ((i * 5) % 9) * 0.02,
      size: 0.6 + ((i * 7) % 5) * 0.22,
      phase: f,
    };
  });
}

const RINGS = buildRings();
const STARS = buildStars();

// ── Component ─────────────────────────────────────────────────────────────────

export function WormholeTransition({
  accentHex,
  onNavigate,
  onDone,
}: WormholeTransitionProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const navigatedRef = useRef(false);
  const doneRef = useRef(false);

  useEffect(() => {
    navigatedRef.current = false;
    doneRef.current = false;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Capture in a const TS tracks across closures
    const cvs: HTMLCanvasElement = canvas;

    // ── Size canvas ──────────────────────────────────────────────────────────
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.offsetWidth;
    const H = canvas.offsetHeight;
    if (W === 0 || H === 0) return;
    canvas.width = W * dpr;
    canvas.height = H * dpr;

    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);

    const cx = W / 2;
    const cy = H / 2;
    // Inscribed circle radius — guarantees nothing ever draws past the viewport edge
    const maxR = Math.min(cx, cy);

    const [ar, ag, ab] = hexToRgb(accentHex);
    const accent = (a: number) => `rgba(${ar},${ag},${ab},${a})`;
    const white = (a: number) => `rgba(255,255,255,${a})`;

    const startTime = performance.now();
    let rafId: number;

    function draw(now: number) {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / DURATION, 1.0);

      // ── Progress curves ────────────────────────────────────────────────────
      // enterAlpha: canvas ramps in over first ~108 ms
      const enterAlpha = Math.min(t / 0.06, 1);
      // tunnelT: main tunnel intensity 0→1 over t = 0..0.72
      const tunnelT = easeInOutCubic(Math.min(t / 0.72, 1));
      // speed multiplier with deceleration during exit
      const rawSpeed = 0.25 + easeInQuart(tunnelT) * 4.0;
      // fadeT: 0 until t = 0.58, then 0→1 for the dissolve phase
      const fadeT = t < 0.58 ? 0 : Math.min((t - 0.58) / 0.42, 1);
      const fadeCurve = easeInOutCubic(fadeT);
      const speed = rawSpeed * (1 - fadeCurve * 0.85);
      // flash envelope: rises at t = 0.46, peaks at t = 0.54, falls by t = 0.72
      const flashRaw = Math.max(
        0,
        t < 0.54 ? (t - 0.46) / 0.08 : t < 0.72 ? 1 - (t - 0.54) / 0.18 : 0,
      );
      const flashT = Math.pow(Math.max(flashRaw, 0), 0.7);
      // dissolveAlpha: overall canvas transparency for a smooth exit
      const dissolveAlpha =
        t < 0.62 ? 1 : 1 - easeInOutCubic((t - 0.62) / 0.38);

      // Apply enter + dissolve to the canvas element so the page is revealed
      cvs.style.opacity = String(enterAlpha * dissolveAlpha);

      // ── Clear ──────────────────────────────────────────────────────────────
      ctx.clearRect(0, 0, W, H);

      // ── Deep-space background ──────────────────────────────────────────────
      const bgAlpha = easeInOutCubic(Math.min(t / 0.15, 1)) * 0.97;
      ctx.fillStyle = `rgba(2,1,12,${bgAlpha})`;
      ctx.fillRect(0, 0, W, H);

      // ── Ambient accent tint radiating from centre ──────────────────────────
      const ambGrd = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR * 0.7);
      ambGrd.addColorStop(0, accent(0.06 * tunnelT));
      ambGrd.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = ambGrd;
      ctx.fillRect(0, 0, W, H);

      // ── Wormhole rings ─────────────────────────────────────────────────────
      // Each ring has a phase offset; as time advances they cycle from centre
      // outward, giving the illusion of endless tunnel depth.
      const time = elapsed / 1000; // seconds, monotonically increasing
      for (const ring of RINGS) {
        const rawP = (((ring.phaseOffset + time * speed * 0.14) % 1) + 1) % 1;
        // Quadratic expansion gives perspective depth illusion
        const r = maxR * 0.65 * rawP * rawP;
        const ry = r * ring.ellipseRatio;
        if (r < 1) continue;

        // Opacity: rises as ring expands, falls near screen edge
        const alpha =
          Math.sin(rawP * Math.PI) * 0.65 * tunnelT * (1 - fadeCurve * 0.5);
        // Line width: thicker near centre (just born) to simulate depth
        const lw = 0.6 + (1 - rawP) * 2.5;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(ring.tiltAngle + time * ring.rotSpeed);

        const { segments, segGap } = ring;
        const segAngle = (Math.PI * 2) / segments;
        for (let s = 0; s < segments; s++) {
          const a1 = s * segAngle;
          const a2 = a1 + segAngle * (1 - segGap);
          ctx.beginPath();
          ctx.ellipse(0, 0, r, ry, 0, a1, a2);
          ctx.strokeStyle = accent(alpha);
          ctx.lineWidth = lw;
          ctx.stroke();
        }
        ctx.restore();
      }

      // ── Hyperspace star streaks ────────────────────────────────────────────
      // Stars race from near-centre outward, leaving light trails.
      for (const star of STARS) {
        const prog =
          (((star.phase + time * star.speed * speed * 0.16) % 1) + 1) % 1;
        const headR = (star.startRadius + prog) * maxR;
        const trailR = Math.max(
          star.startRadius * maxR,
          headR - maxR * star.streakLen * (0.3 + speed * 0.15),
        );
        if (headR > maxR || trailR >= headR) continue;

        const hx = cx + Math.cos(star.angle) * headR;
        const hy = cy + Math.sin(star.angle) * headR;
        const tx = cx + Math.cos(star.angle) * trailR;
        const ty = cy + Math.sin(star.angle) * trailR;

        const alpha =
          Math.min(prog * 2, 1) * 0.75 * tunnelT * (1 - fadeCurve * 0.6);
        const grd = ctx.createLinearGradient(tx, ty, hx, hy);
        grd.addColorStop(0, accent(0));
        grd.addColorStop(0.6, accent(alpha * 0.5));
        grd.addColorStop(1, white(alpha));

        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(hx, hy);
        ctx.strokeStyle = grd;
        ctx.lineWidth = star.size * (0.5 + tunnelT * 0.5);
        ctx.stroke();
      }

      // ── Radial energy spokes from centre ──────────────────────────────────
      const numSpokes = 24;
      for (let i = 0; i < numSpokes; i++) {
        const angle = (i / numSpokes) * Math.PI * 2 + time * 0.55;
        const len = maxR * 0.3 * tunnelT * Math.pow(speed, 0.25);
        const innerR = maxR * 0.015;
        const x1 = cx + Math.cos(angle) * innerR;
        const y1 = cy + Math.sin(angle) * innerR;
        const x2 = cx + Math.cos(angle) * (innerR + len);
        const y2 = cy + Math.sin(angle) * (innerR + len);
        const spokeGrd = ctx.createLinearGradient(x1, y1, x2, y2);
        spokeGrd.addColorStop(
          0,
          accent(0.18 * tunnelT * (1 - fadeCurve * 0.7)),
        );
        spokeGrd.addColorStop(1, "rgba(0,0,0,0)");
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = spokeGrd;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }

      // ── Central event-horizon glow ─────────────────────────────────────────
      const glowR = maxR * (0.045 + tunnelT * 0.22 + flashT * 0.1);
      const glowGrd = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
      glowGrd.addColorStop(0, white(Math.min(tunnelT * 0.9 + flashT * 0.4, 1)));
      glowGrd.addColorStop(0.18, accent(tunnelT * 0.8 + flashT * 0.3));
      glowGrd.addColorStop(0.55, accent(tunnelT * 0.25));
      glowGrd.addColorStop(1, "rgba(0,0,0,0)");
      ctx.beginPath();
      ctx.arc(cx, cy, glowR, 0, Math.PI * 2);
      ctx.fillStyle = glowGrd;
      ctx.fill();

      // ── Edge vignette ──────────────────────────────────────────────────────
      const vigGrd = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR);
      vigGrd.addColorStop(0.5, "rgba(0,0,0,0)");
      vigGrd.addColorStop(1, `rgba(0,0,0,${tunnelT * 0.75})`);
      ctx.fillStyle = vigGrd;
      ctx.fillRect(0, 0, W, H);

      // ── White flash ────────────────────────────────────────────────────────
      if (flashT > 0.001) {
        ctx.fillStyle = white(flashT * 0.94);
        ctx.fillRect(0, 0, W, H);
        // Subtle accent tint on top
        ctx.fillStyle = accent(flashT * 0.25);
        ctx.fillRect(0, 0, W, H);
      }

      // ── Trigger callbacks ──────────────────────────────────────────────────
      if (t >= NAVIGATE_AT && !navigatedRef.current) {
        navigatedRef.current = true;
        onNavigate();
      }

      if (t >= 1.0 && !doneRef.current) {
        doneRef.current = true;
        onDone();
        return; // stop loop
      }

      rafId = requestAnimationFrame(draw);
    }

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [accentHex, onNavigate, onDone]);

  return createPortal(
    <motion.div
      style={{
        position: "fixed",
        inset: "var(--window-frame-current-gap, 12px)",
        borderRadius: "var(--window-shell-current-radius, 18px)",
        zIndex: 9999,
        pointerEvents: "none",
        overflow: "hidden",
      }}
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.1 }}
    >
      <canvas
        ref={canvasRef}
        style={{
          display: "block",
          width: "100%",
          height: "100%",
          borderRadius: "inherit",
        }}
      />
    </motion.div>,
    document.body,
  );
}
