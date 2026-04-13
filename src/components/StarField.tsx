import { useEffect, useRef } from "react";

interface Star {
  x: number;
  y: number;
  radius: number;
  opacity: number;
  speed: number;
  twinkleOffset: number;
  twinkleSpeed: number;
}

const STAR_COUNT = 180;
const SHOOTING_STAR_INTERVAL = 4000; // ms

function randomBetween(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

export default function StarField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = canvas.offsetWidth;
    let height = canvas.offsetHeight;

    const resize = () => {
      width = canvas.offsetWidth;
      height = canvas.offsetHeight;
      canvas.width = width;
      canvas.height = height;
      initStars();
    };

    const initStars = () => {
      starsRef.current = Array.from({ length: STAR_COUNT }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        radius: randomBetween(0.3, 1.8),
        opacity: randomBetween(0.4, 1.0),
        speed: randomBetween(0.05, 0.25),
        twinkleOffset: Math.random() * Math.PI * 2,
        twinkleSpeed: randomBetween(0.4, 1.2),
      }));
    };

    const spawnShootingStar = () => {
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
    };

    const shootingInterval = setInterval(
      spawnShootingStar,
      SHOOTING_STAR_INTERVAL,
    );
    let then = performance.now();

    const draw = (now: number) => {
      animFrameRef.current = requestAnimationFrame(draw);
      const elapsed = now - then;
      then = now;
      const t = now / 1000;

      ctx.clearRect(0, 0, width, height);

      // Draw stars
      for (const star of starsRef.current) {
        const twinkle =
          0.5 + 0.5 * Math.sin(t * star.twinkleSpeed + star.twinkleOffset);
        const alpha = star.opacity * (0.55 + 0.45 * twinkle);

        ctx.beginPath();
        ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(200, 192, 240, ${alpha})`;
        ctx.fill();

        // Gentle drift
        star.y += star.speed * (elapsed / 16);
        if (star.y > height + 2) {
          star.y = -2;
          star.x = Math.random() * width;
        }
      }

      // Draw shooting star
      const s = shootingRef.current;
      if (s && s.active) {
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
    };

    resize();
    animFrameRef.current = requestAnimationFrame(draw);

    const onVisibilityChange = () => {
      if (document.hidden) {
        cancelAnimationFrame(animFrameRef.current);
      } else {
        then = performance.now();
        animFrameRef.current = requestAnimationFrame(draw);
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    const observer = new ResizeObserver(resize);
    observer.observe(canvas.parentElement ?? document.body);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      clearInterval(shootingInterval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      observer.disconnect();
    };
  }, []);

  return (
    <canvas ref={canvasRef} className="starfield-canvas" aria-hidden="true" />
  );
}
