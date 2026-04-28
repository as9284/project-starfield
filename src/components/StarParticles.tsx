import { useEffect, useRef, useCallback } from "react";
import { useVisibilityPausedRAF } from "../hooks/useVisibilityPausedRAF";
import { useAppStore } from "../store/useAppStore";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  opacity: number;
  pulseSpeed: number;
  pulsePhase: number;
}

const NORMAL_PARTICLE_COUNT = 60;
const PERF_PARTICLE_COUNT = 30;

export function StarParticles() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: 0, y: 0 });
  const particlesRef = useRef<Particle[]>([]);
  const dimensionsRef = useRef({ width: 0, height: 0 });
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  const performanceMode = useAppStore((s) => s.performanceMode);

  const initParticles = useCallback((width: number, height: number, count: number) => {
    particlesRef.current = [];
    for (let i = 0; i < count; i++) {
      particlesRef.current.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.15,
        vy: (Math.random() - 0.5) * 0.1,
        size: Math.random() * 1.8 + 0.4,
        opacity: Math.random() * 0.5 + 0.15,
        pulseSpeed: Math.random() * 0.008 + 0.003,
        pulsePhase: Math.random() * Math.PI * 2,
      });
    }
  }, []);

  const handleResize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    const width = parent.clientWidth;
    const height = parent.clientHeight;
    canvas.width = width * window.devicePixelRatio;
    canvas.height = height * window.devicePixelRatio;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext("2d");
    ctx?.scale(window.devicePixelRatio, window.devicePixelRatio);
    dimensionsRef.current = { width, height };
    initParticles(width, height, performanceMode ? PERF_PARTICLE_COUNT : NORMAL_PARTICLE_COUNT);
  }, [performanceMode, initParticles]);

  const draw = useCallback(
    (time: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const { width, height } = dimensionsRef.current;

      ctx.clearRect(0, 0, width, height);

      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;

      for (const p of particlesRef.current) {
        p.x += p.vx;
        p.y += p.vy;

        const dx = p.x - mx;
        const dy = p.y - my;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 120 && dist > 0) {
          const force = (120 - dist) / 120 * 0.3;
          p.vx += (dx / dist) * force * 0.02;
          p.vy += (dy / dist) * force * 0.02;
        }

        p.vx *= 0.998;
        p.vy *= 0.998;

        if (p.x < -10) p.x = width + 10;
        if (p.x > width + 10) p.x = -10;
        if (p.y < -10) p.y = height + 10;
        if (p.y > height + 10) p.y = -10;

        const pulse = Math.sin(time * p.pulseSpeed + p.pulsePhase) * 0.3 + 0.7;
        const alpha = p.opacity * pulse;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(180, 160, 255, ${alpha})`;
        ctx.fill();

        if (p.size > 1.2) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(124, 79, 240, ${alpha * 0.12})`;
          ctx.fill();
        }
      }
    },
    [],
  );

  const { setElement } = useVisibilityPausedRAF(draw, [draw]);

  const onMouseMove = useCallback((e: MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    mouseRef.current.x = e.clientX - rect.left;
    mouseRef.current.y = e.clientY - rect.top;
  }, []);

  useEffect(() => {
    handleResize();

    resizeObserverRef.current = new ResizeObserver(handleResize);
    const canvas = canvasRef.current;
    if (canvas?.parentElement) {
      resizeObserverRef.current.observe(canvas.parentElement);
    }

    window.addEventListener("resize", handleResize);
    document.addEventListener("mousemove", onMouseMove);

    return () => {
      resizeObserverRef.current?.disconnect();
      window.removeEventListener("resize", handleResize);
      document.removeEventListener("mousemove", onMouseMove);
    };
  }, [handleResize, onMouseMove]);

  return (
    <canvas
      ref={(el) => {
        (canvasRef as React.MutableRefObject<HTMLCanvasElement | null>).current = el;
        setElement(el);
      }}
      className="star-particles-canvas"
    />
  );
}
