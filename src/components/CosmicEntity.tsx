import { useEffect, useRef, useCallback } from "react";
import { useVisibilityPausedRAF } from "../hooks/useVisibilityPausedRAF";

export type EntityMood = "idle" | "listening" | "thinking" | "speaking";

interface CosmicEntityProps {
  size?: number;
  mood?: EntityMood;
  className?: string;
}

const TAU = Math.PI * 2;
const DPR =
  typeof window !== "undefined" ? Math.min(window.devicePixelRatio, 2) : 1;

// ── Component ─────────────────────────────────────────────────────────────────

export function CosmicEntity({
  size = 240,
  className,
}: CosmicEntityProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const timeRef = useRef(0);

  const half = size / 2;
  const pad = Math.round(size * 0.35);
  const side = size + pad * 2;
  const coreR = half * 0.32;
  const ringR = half * 0.66;

  const draw = useCallback(
    (now: number, ctx: CanvasRenderingContext2D) => {
      const dt = Math.min((now - performance.now()) / 1000, 0.05);
      timeRef.current += dt;
      const t = timeRef.current;

      const hue = 268;
      const glow = 0.42;
      const ringAlpha = 0.15;

      ctx.clearRect(0, 0, side, side);
      ctx.save();
      ctx.translate(half + pad, half + pad);

      // ── Corona glow ────────────────────────────────────────────────────
      const corona = ctx.createRadialGradient(
        0, 0, coreR * 0.5,
        0, 0, coreR * 4.0
      );
      corona.addColorStop(0, `hsla(${hue}, 80%, 72%, ${glow * 0.55})`);
      corona.addColorStop(0.25, `hsla(${hue + 15}, 66%, 58%, ${glow * 0.18})`);
      corona.addColorStop(0.6, `hsla(${hue + 25}, 52%, 46%, ${glow * 0.05})`);
      corona.addColorStop(1, "transparent");
      ctx.fillStyle = corona;
      ctx.beginPath();
      ctx.arc(0, 0, coreR * 4.0, 0, TAU);
      ctx.fill();

      // ── Planet sphere ──────────────────────────────────────────────────
      const hlX = coreR * -0.18;
      const hlY = coreR * -0.22;
      const sphere = ctx.createRadialGradient(hlX, hlY, 0, 0, 0, coreR);
      sphere.addColorStop(0, "hsla(0, 0%, 100%, 0.97)");
      sphere.addColorStop(0.12, `hsla(${hue + 35}, 45%, 93%, 0.88)`);
      sphere.addColorStop(0.35, `hsla(${hue + 20}, 68%, 76%, 0.70)`);
      sphere.addColorStop(0.65, `hsla(${hue + 5}, 78%, 54%, 0.50)`);
      sphere.addColorStop(0.88, `hsla(${hue - 8}, 82%, 38%, 0.24)`);
      sphere.addColorStop(1, `hsla(${hue - 15}, 85%, 25%, 0)`);
      ctx.fillStyle = sphere;
      ctx.beginPath();
      ctx.arc(0, 0, coreR, 0, TAU);
      ctx.fill();

      // ── Orbital ring ───────────────────────────────────────────────────
      ctx.save();
      ctx.rotate(t * 0.048);
      ctx.scale(1, 0.24);
      ctx.beginPath();
      ctx.arc(0, 0, ringR, 0, TAU);
      ctx.strokeStyle = `hsla(${hue + 28}, 66%, 72%, ${ringAlpha})`;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();

      ctx.restore();
    },
    [side, half, pad, coreR, ringR]
  );

  const drawFrame = useCallback(
    (now: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d", { alpha: true });
      if (!ctx) return;
      draw(now, ctx);
    },
    [draw]
  );

  const { setElement } = useVisibilityPausedRAF(drawFrame, [drawFrame]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;
    canvas.width = side * DPR;
    canvas.height = side * DPR;
    canvas.style.width = `${side}px`;
    canvas.style.height = `${side}px`;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }, [side]);

  return (
    <div
      ref={(el) => {
        (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
        setElement(el as unknown as HTMLCanvasElement);
      }}
      className={className}
      style={{
        position: "relative",
        width: size,
        height: size,
        overflow: "visible",
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          left: -pad,
          top: -pad,
          width: size + pad * 2,
          height: size + pad * 2,
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
