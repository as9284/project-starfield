import { useEffect, useRef, useCallback, useState } from "react";

export interface UseVisibilityPausedRAFOptions {
  performanceMode?: boolean;
}

export interface UseVisibilityPausedRAFReturn {
  isPaused: boolean;
  setElement: (el: HTMLCanvasElement | null) => void;
}

export function useVisibilityPausedRAF(
  callback: (timestamp: number) => void,
  deps: React.DependencyList,
  options: UseVisibilityPausedRAFOptions = {},
): UseVisibilityPausedRAFReturn {
  const { performanceMode = false } = options;
  const elementRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number>(0);
  const thenRef = useRef<number>(0);
  const isPausedRef = useRef<boolean>(false);
  const [isPaused, setIsPaused] = useState(false);

  const stopLoop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    isPausedRef.current = true;
    setIsPaused(true);
  }, []);

  const startLoop = useCallback(() => {
    thenRef.current = performance.now();
    isPausedRef.current = false;
    setIsPaused(false);

    const loop = (timestamp: number) => {
      if (isPausedRef.current) return;

      if (performanceMode) {
        const elapsed = timestamp - thenRef.current;
        if (elapsed < 33) {
          rafRef.current = requestAnimationFrame(loop);
          return;
        }
        thenRef.current = timestamp - (elapsed % 33);
      }

      callback(timestamp);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, [callback, performanceMode]);

  useEffect(() => {
    const canvas = elementRef.current;
    if (!canvas) return;

    let observer: IntersectionObserver | null = null;

    const handleVisibility = () => {
      if (document.hidden) {
        stopLoop();
      } else {
        startLoop();
      }
    };

    observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry.isIntersecting) {
          stopLoop();
        } else if (!document.hidden) {
          startLoop();
        }
      },
      { threshold: 0 },
    );
    observer.observe(canvas);

    document.addEventListener("visibilitychange", handleVisibility);

    if (!document.hidden) {
      startLoop();
    } else {
      stopLoop();
    }

    return () => {
      stopLoop();
      document.removeEventListener("visibilitychange", handleVisibility);
      observer?.disconnect();
    };
  }, deps);

  const setElement = useCallback((el: HTMLCanvasElement | null) => {
    elementRef.current = el;
  }, []);

  return { isPaused, setElement };
}
