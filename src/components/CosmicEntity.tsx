import { useEffect, useRef } from "react";

export type EntityMood = "idle" | "listening" | "thinking" | "speaking";

interface CosmicEntityProps {
  size?: number;
  mood?: EntityMood;
  className?: string;
}

// ─── IMPLEMENTATION NOTE ──────────────────────────────────────────────────────
// Two-layer canvas design for smoothness:
//   1. Aurora canvas  — 5 large colour blobs in Lissajous orbits, CSS-blurred
//                       into a soft, fluid nebula cloud.
//   2. Core canvas    — Sharp, luminous sphere + slow orbital ring on top.
// No high-frequency particles or wobble noise — all motion < 0.5 Hz.
// ─────────────────────────────────────────────────────────────────────────────

const TAU = Math.PI * 2;
const DPR =
  typeof window !== "undefined" ? Math.min(window.devicePixelRatio, 2) : 1;

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/* ─── Mood parameters ────────────────────────────────────────────────── */

interface MoodState {
  hue: number; // dominant hue (degrees)
  spread: number; // blob orbit radius (fraction of half)
  glow: number; // corona glow intensity 0–1
  saturation: number; // colour saturation 0–100
  colorRange: number; // hue spread across blobs (degrees)
  speed: number; // animation speed multiplier
  blobAlpha: number; // blob opacity
  coreSize: number; // core sphere radius (fraction of half)
}

const MOODS: Record<EntityMood, MoodState> = {
  idle: {
    hue: 262,
    spread: 0.22,
    glow: 0.55,
    saturation: 70,
    colorRange: 42,
    speed: 0.26,
    blobAlpha: 0.85,
    coreSize: 0.3,
  },
  listening: {
    hue: 256,
    spread: 0.28,
    glow: 0.68,
    saturation: 78,
    colorRange: 50,
    speed: 0.42,
    blobAlpha: 0.92,
    coreSize: 0.33,
  },
  thinking: {
    hue: 244,
    spread: 0.34,
    glow: 0.85,
    saturation: 85,
    colorRange: 64,
    speed: 0.78,
    blobAlpha: 0.97,
    coreSize: 0.28,
  },
  speaking: {
    hue: 270,
    spread: 0.3,
    glow: 0.92,
    saturation: 84,
    colorRange: 58,
    speed: 0.56,
    blobAlpha: 1.0,
    coreSize: 0.35,
  },
};

/* ─── Blob definitions ───────────────────────────────────────────────── */
/**
 * Each blob drifts in a Lissajous orbit (independent X/Y frequencies)
 * for a non-repeating, fluid path. Fixed constants — no randomness per frame.
 */
const BLOBS = [
  {
    hueShift: 0,
    freqX: 0.31,
    freqY: 0.19,
    phaseX: 0.0,
    phaseY: 0.0,
    orb: 1.0,
    sz: 0.5,
  },
  {
    hueShift: 28,
    freqX: 0.19,
    freqY: 0.27,
    phaseX: 2.09,
    phaseY: 1.57,
    orb: 0.82,
    sz: 0.44,
  },
  {
    hueShift: -22,
    freqX: 0.23,
    freqY: 0.15,
    phaseX: 4.19,
    phaseY: 3.14,
    orb: 0.9,
    sz: 0.48,
  },
  {
    hueShift: 42,
    freqX: 0.15,
    freqY: 0.23,
    phaseX: 1.05,
    phaseY: 5.24,
    orb: 1.1,
    sz: 0.38,
  },
  {
    hueShift: -38,
    freqX: 0.27,
    freqY: 0.12,
    phaseX: 3.67,
    phaseY: 2.62,
    orb: 0.72,
    sz: 0.42,
  },
] as const;

/* ─── Component ──────────────────────────────────────────────────────── */

export function CosmicEntity({
  size = 240,
  mood = "idle",
  className,
}: CosmicEntityProps) {
  // Layer 1: aurora blobs — CSS-blurred into a soft nebula cloud
  // Layer 2: core        — sharp luminous sphere + subtle orbital ring
  const auroraRef = useRef<HTMLCanvasElement>(null);
  const coreRef = useRef<HTMLCanvasElement>(null);

  const stateRef = useRef({
    time: 0,
    cur: { ...MOODS[mood] } as MoodState,
  });
  const moodRef = useRef<EntityMood>(mood);
  moodRef.current = mood;

  useEffect(() => {
    const aCanvas = auroraRef.current;
    const cCanvas = coreRef.current;
    if (!aCanvas || !cCanvas) return;

    const aC = aCanvas.getContext("2d", { alpha: true });
    const cC = cCanvas.getContext("2d", { alpha: true });
    if (!aC || !cC) return;

    const px = size * DPR;
    const half = size / 2;

    for (const cv of [aCanvas, cCanvas]) {
      cv.width = px;
      cv.height = px;
      cv.style.width = `${size}px`;
      cv.style.height = `${size}px`;
    }
    aC.setTransform(DPR, 0, 0, DPR, 0, 0);
    cC.setTransform(DPR, 0, 0, DPR, 0, 0);

    let frameId: number;
    let last = performance.now();

    const draw = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      const s = stateRef.current;
      s.time += dt;
      const t = s.time;

      // Graceful lerp toward target mood (~1 s to 80% convergence at 60 fps)
      const target = MOODS[moodRef.current];
      const lr = 1.5 * dt;
      const c = s.cur;
      c.hue = lerp(c.hue, target.hue, lr);
      c.spread = lerp(c.spread, target.spread, lr);
      c.glow = lerp(c.glow, target.glow, lr);
      c.saturation = lerp(c.saturation, target.saturation, lr);
      c.colorRange = lerp(c.colorRange, target.colorRange, lr);
      c.speed = lerp(c.speed, target.speed, lr);
      c.blobAlpha = lerp(c.blobAlpha, target.blobAlpha, lr);
      c.coreSize = lerp(c.coreSize, target.coreSize, lr);

      /* ── Aurora layer ──────────────────────────────────────────────── */
      aC.clearRect(0, 0, size, size);
      aC.save();
      aC.translate(half, half);

      for (const b of BLOBS) {
        const ts = t * c.speed;
        const bx = Math.cos(b.freqX * ts + b.phaseX) * c.spread * b.orb * half;
        const by = Math.sin(b.freqY * ts + b.phaseY) * c.spread * b.orb * half;
        const bSz = b.sz * half;
        const bHue = c.hue + (b.hueShift / 42) * c.colorRange;

        const grad = aC.createRadialGradient(bx, by, 0, bx, by, bSz);
        grad.addColorStop(
          0,
          `hsla(${bHue},      ${c.saturation + 12}%, 62%, ${c.blobAlpha * 0.58})`,
        );
        grad.addColorStop(
          0.4,
          `hsla(${bHue + 12}, ${c.saturation}%,      48%, ${c.blobAlpha * 0.2})`,
        );
        grad.addColorStop(1, "transparent");
        aC.fillStyle = grad;
        aC.beginPath();
        aC.arc(bx, by, bSz, 0, TAU);
        aC.fill();
      }

      aC.restore();

      /* ── Core layer ────────────────────────────────────────────────── */
      cC.clearRect(0, 0, size, size);
      cC.save();
      cC.translate(half, half);

      // Very slow breathing — period ≈ 16.5 s
      const breath = Math.sin(t * 0.38) * 0.5 + 0.5;
      const coreR = half * c.coreSize * (1 + breath * 0.05);

      // Outer corona
      const corona = cC.createRadialGradient(
        0,
        0,
        coreR * 0.5,
        0,
        0,
        coreR * 4.2,
      );
      corona.addColorStop(0, `hsla(${c.hue},      82%, 76%, ${c.glow * 0.6})`);
      corona.addColorStop(
        0.25,
        `hsla(${c.hue + 15}, 70%, 62%, ${c.glow * 0.22})`,
      );
      corona.addColorStop(
        0.6,
        `hsla(${c.hue + 25}, 58%, 52%, ${c.glow * 0.07})`,
      );
      corona.addColorStop(1, "transparent");
      cC.fillStyle = corona;
      cC.beginPath();
      cC.arc(0, 0, coreR * 4.2, 0, TAU);
      cC.fill();

      // Sphere with off-centre highlight for depth
      const hlX = coreR * -0.18;
      const hlY = coreR * -0.22;
      const sphere = cC.createRadialGradient(hlX, hlY, 0, 0, 0, coreR);
      sphere.addColorStop(0, "hsla(0, 0%, 100%, 0.97)");
      sphere.addColorStop(0.12, `hsla(${c.hue + 35}, 45%, 93%, 0.88)`);
      sphere.addColorStop(0.35, `hsla(${c.hue + 20}, 68%, 76%, 0.70)`);
      sphere.addColorStop(0.65, `hsla(${c.hue + 5},  78%, 54%, 0.50)`);
      sphere.addColorStop(0.88, `hsla(${c.hue - 8},  82%, 38%, 0.24)`);
      sphere.addColorStop(1, `hsla(${c.hue - 15}, 85%, 25%, 0)`);
      cC.fillStyle = sphere;
      cC.beginPath();
      cC.arc(0, 0, coreR, 0, TAU);
      cC.fill();

      // Slow orbital ring — one rotation per ≈115 s
      cC.save();
      cC.rotate(t * 0.055);
      cC.scale(1, 0.26);
      cC.beginPath();
      cC.arc(0, 0, half * 0.64, 0, TAU);
      cC.strokeStyle = `hsla(${c.hue + 28}, 72%, 76%, ${c.glow * 0.18})`;
      cC.lineWidth = 1;
      cC.stroke();
      cC.restore();

      cC.restore();

      frameId = requestAnimationFrame(draw);
    };

    frameId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frameId);
  }, [size]);

  // Blur scales with container size; minimum 3 px for the mini entity
  const blurPx = Math.max(3, Math.round(size * 0.088));

  return (
    <div
      className={className}
      style={{ position: "relative", width: size, height: size }}
    >
      <canvas
        ref={auroraRef}
        style={{
          position: "absolute",
          inset: 0,
          filter: `blur(${blurPx}px)`,
          width: size,
          height: size,
        }}
      />
      <canvas
        ref={coreRef}
        style={{
          position: "absolute",
          inset: 0,
          width: size,
          height: size,
        }}
      />
    </div>
  );
}
