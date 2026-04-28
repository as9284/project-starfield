import { useEffect, useRef, useCallback } from "react";
import { useVisibilityPausedRAF } from "../hooks/useVisibilityPausedRAF";
import { useAppStore } from "../store/useAppStore";

interface Star {
  x: number;
  y: number;
  radius: number;
  opacity: number;
  speed: number;
  twinkleOffset: number;
  twinkleSpeed: number;
}

const NORMAL_STAR_COUNT = 180;
const PERF_STAR_COUNT = 80;
const SHOOTING_STAR_INTERVAL = 4000;

function randomBetween(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

export default function StarField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const starsRef = useRef<Star[]>([]);
  const shootingRef = useRef<{
    x: number;
    y: number;
    dx: number;
    dy: number;
    len: number;
    opacity: number;
    active: boolean;
  } | null>(null);
  const dimensionsRef = useRef({ width: 0, height: 0 });
  const shootingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  const performanceMode = useAppStore((s) => s.performanceMode);

  const initStars = useCallback((width: number, height: number, count: number) => {
    starsRef.current = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      radius: randomBetween(0.3, 1.8),
      opacity: randomBetween(0.4, 1.0),
      speed: randomBetween(0.05, 0.25),
      twinkleOffset: Math.random() * Math.PI * 2,
      twinkleSpeed: randomBetween(0.4, 1.2),
    }));
  }, []);

  const handleResize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const width = canvas.offsetWidth;
    const height = canvas.offsetHeight;
    canvas.width = width;
    canvas.height = height;
    dimensionsRef.current = { width, height };
    initStars(width, height, performanceMode ? PERF_STAR_COUNT : NORMAL_STAR_COUNT);
  }, [performanceMode, initStars]);

  const spawnShootingStar = useCallback(() => {
    const { width, height } = dimensionsRef.current;
    if (!width || !height) return;
    const startX = randomBetween(0.2, 0.8) * width;
    const startY = randomBetween(0.05, 0.35) * height;
    const angle = randomBetween(20, 50) * (Math.PI / 180);
    const speed = randomBetween(6, 12);
    shootingRef.current = {
      x: startX,
      y: startY,
      dx: Math.cos(angle) * speed,
      dy: Math.sin(angle) * speed,
      len: randomBetween(80, 180),
      opacity: 1,
      active: true,
    };
  }, []);

  const draw = useCallback(
    (now: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const { width, height } = dimensionsRef.current;
      const showShootingStars = !performanceMode;

      const t = now / 1000;

      ctx.clearRect(0, 0, width, height);

      for (const star of starsRef.current) {
        const twinkle =
          0.5 + 0.5 * Math.sin(t * star.twinkleSpeed + star.twinkleOffset);
        const alpha = star.opacity * (0.55 + 0.45 * twinkle);

        ctx.beginPath();
        ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(200, 192, 240, ${alpha})`;
        ctx.fill();

        star.y += star.speed;
        if (star.y > height + 2) {
          star.y = -2;
          star.x = Math.random() * width;
        }
      }

      const s = shootingRef.current;
      if (s && s.active && showShootingStars) {
        const gradient = ctx.createLinearGradient(
          s.x,
          s.y,
          s.x - s.dx * (s.len / 10),
          s.y - s.dy * (s.len / 10),
        );
        gradient.addColorStop(0, `rgba(255, 255, 255, ${s.opacity})`);
        gradient.addColorStop(0.4, `rgba(190, 160, 255, ${s.opacity * 0.6})`);
        gradient.addColorStop(1, "rgba(0,0,0,0)");

        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x - s.dx * (s.len / 10), s.y - s.dy * (s.len / 10));
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        s.x += s.dx;
        s.y += s.dy;
        s.opacity -= 0.025;

        if (s.opacity <= 0 || s.x > width + 100 || s.y > height + 100) {
          shootingRef.current = null;
        }
      }
    },
    [performanceMode],
  );

  const { setElement } = useVisibilityPausedRAF(draw, [draw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    handleResize();

    resizeObserverRef.current = new ResizeObserver(handleResize);
    resizeObserverRef.current.observe(canvas.parentElement ?? document.body);

    return () => {
      resizeObserverRef.current?.disconnect();
    };
  }, [handleResize]);

  useEffect(() => {
    if (performanceMode) {
      if (shootingIntervalRef.current !== null) {
        clearInterval(shootingIntervalRef.current);
        shootingIntervalRef.current = null;
      }
    } else {
      if (shootingIntervalRef.current === null) {
        shootingIntervalRef.current = setInterval(spawnShootingStar, SHOOTING_STAR_INTERVAL);
      }
    }
    return () => {
      if (shootingIntervalRef.current !== null) {
        clearInterval(shootingIntervalRef.current);
        shootingIntervalRef.current = null;
      }
    };
  }, [performanceMode, spawnShootingStar]);

  return (
    <canvas
      ref={(el) => {
        (canvasRef as React.MutableRefObject<HTMLCanvasElement | null>).current = el;
        setElement(el);
      }}
      className="starfield-canvas"
      aria-hidden="true"
    />
  );
}
