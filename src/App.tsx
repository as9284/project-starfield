import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import TitleBar from "./components/TitleBar";
import ConstellationOverlay from "./components/ConstellationOverlay";
import SplashScreen from "./components/SplashScreen";
import Luna from "./pages/Luna";
import { WormholeTransition } from "./components/WormholeTransition";
import { useAppStore } from "./store/useAppStore";
import { getDeepSeekKey, getTavilyKey, getWeatherKey, win } from "./lib/tauri";
import { buildShortcutMap } from "./lib/constellation-catalog";

const SHORTCUT_MAP = buildShortcutMap();

const Orbit = lazy(() => import("./pages/Orbit"));
const Solaris = lazy(() => import("./pages/Solaris"));
const Beacon = lazy(() => import("./pages/Beacon"));
const Pulsar = lazy(() => import("./pages/Pulsar"));
const Hyperlane = lazy(() => import("./pages/Hyperlane"));
const Settings = lazy(() => import("./pages/Settings"));

// Prefetch modules on hover
function prefetch(module: () => Promise<unknown>) {
  module();
}

const slideIn = {
  initial: { opacity: 0, x: 10 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -10 },
  transition: { duration: 0.2 },
};

const pageFallback = (
  <div className="flex-1 flex items-center justify-center">
    <div className="status-dot" />
  </div>
);

export default function App() {
  const {
    view,
    showConstellations,
    setHasDeepSeekKey,
    setHasTavilyKey,
    setHasWeatherKey,
    setView,
    goBack,
    toggleConstellations,
    isStreaming,
    wormholeTarget,
    clearWormhole,
    closeConstellations,
  } = useAppStore();

  const isStreamingRef = useRef(isStreaming);
  useEffect(() => {
    isStreamingRef.current = isStreaming;
  }, [isStreaming]);

  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  const [isMaximized, setIsMaximized] = useState(false);
  const [splashDone, setSplashDone] = useState(false);
  const splashStartRef = useRef(Date.now());
  const SPLASH_MIN_MS = 600;

  // Wormhole transition callbacks — stable refs so the canvas effect doesn't restart
  const wormholeTargetRef = useRef(wormholeTarget);
  useEffect(() => {
    wormholeTargetRef.current = wormholeTarget;
  }, [wormholeTarget]);

  const handleWormholeNavigate = useCallback(() => {
    const target = wormholeTargetRef.current;
    if (target) {
      setView(target.id);
      closeConstellations();
    }
  }, [setView, closeConstellations]);

  const handleWormholeDone = useCallback(() => {
    clearWormhole();
  }, [clearWormhole]);

  useEffect(() => {
    if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
      return;
    }

    let isMounted = true;
    let unlistenResize: (() => void) | undefined;
    const currentWindow = win();

    const syncMaximizedState = () => {
      currentWindow
        .isMaximized()
        .then((maximized) => {
          if (isMounted) {
            setIsMaximized(maximized);
          }
        })
        .catch(() => {
          if (isMounted) {
            setIsMaximized(false);
          }
        });
    };

    currentWindow.setShadow(false).catch(() => undefined);
    syncMaximizedState();

    currentWindow
      .onResized(() => {
        syncMaximizedState();
      })
      .then((cleanup) => {
        if (isMounted) {
          unlistenResize = cleanup;
        } else {
          cleanup();
        }
      })
      .catch(() => undefined);

    return () => {
      isMounted = false;
      unlistenResize?.();
    };
  }, []);

  // Bootstrap: check if API keys are already stored in the keychain
  useEffect(() => {
    const start = splashStartRef.current;

    Promise.allSettled([
      getDeepSeekKey()
        .then((k) => setHasDeepSeekKey(!!k))
        .catch(() => setHasDeepSeekKey(false)),
      getTavilyKey()
        .then((k) => setHasTavilyKey(!!k))
        .catch(() => setHasTavilyKey(false)),
      getWeatherKey()
        .then((k) => setHasWeatherKey(!!k))
        .catch(() => setHasWeatherKey(false)),
    ]).then(() => {
      const elapsed = Date.now() - start;
      const remaining = SPLASH_MIN_MS - elapsed;
      if (remaining > 0) {
        setTimeout(() => setSplashDone(true), remaining);
      } else {
        setSplashDone(true);
      }
    });
  }, [setHasDeepSeekKey, setHasTavilyKey, setHasWeatherKey]);

  // ── Global keyboard shortcuts ──────────────────────────────────────────
  // Use refs for state values so the listener is never re-attached
  const showConstRef = useRef(showConstellations);
  useEffect(() => {
    showConstRef.current = showConstellations;
  }, [showConstellations]);

  const goBackRef = useRef(goBack);
  useEffect(() => {
    goBackRef.current = goBack;
  }, [goBack]);

  const setViewRef = useRef(setView);
  useEffect(() => {
    setViewRef.current = setView;
  }, [setView]);

  const toggleConstRef = useRef(toggleConstellations);
  useEffect(() => {
    toggleConstRef.current = toggleConstellations;
  }, [toggleConstellations]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (isStreamingRef.current) return;

      const isMod = e.ctrlKey || e.metaKey;

      if (e.key === "Escape") {
        if (showConstRef.current) return;
        if (viewRef.current !== "luna") {
          e.preventDefault();
          goBackRef.current();
        }
        return;
      }

      if (isMod && e.key === "k") {
        e.preventDefault();
        toggleConstRef.current();
        return;
      }

      if (isMod && e.key === ",") {
        e.preventDefault();
        setViewRef.current("settings");
        return;
      }

      if (isMod && !e.shiftKey && !e.altKey) {
        const target = SHORTCUT_MAP[e.key];
        if (target) {
          e.preventDefault();
          setViewRef.current(target);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div
      className={`window-frame${isMaximized ? " window-frame-maximized" : ""}`}
    >
      <div className="app-shell bg-cosmic">
        <TitleBar
          onPrefetchView={(v) => {
            if (v === "orbit") prefetch(() => import("./pages/Orbit"));
            if (v === "settings") prefetch(() => import("./pages/Settings"));
          }}
        />
        <AnimatePresence mode="wait">
          {view === "luna" && (
            <motion.div
              key="luna"
              className="flex-1 flex flex-col min-h-0"
              {...slideIn}
            >
              <Luna />
            </motion.div>
          )}
          {view === "orbit" && (
            <motion.div
              key="orbit"
              className="flex-1 flex flex-col min-h-0"
              {...slideIn}
            >
              <Suspense fallback={pageFallback}>
                <Orbit />
              </Suspense>
            </motion.div>
          )}
          {view === "solaris" && (
            <motion.div
              key="solaris"
              className="flex-1 flex flex-col min-h-0"
              {...slideIn}
            >
              <Suspense fallback={pageFallback}>
                <Solaris />
              </Suspense>
            </motion.div>
          )}
          {view === "beacon" && (
            <motion.div
              key="beacon"
              className="flex-1 flex flex-col min-h-0"
              {...slideIn}
            >
              <Suspense fallback={pageFallback}>
                <Beacon />
              </Suspense>
            </motion.div>
          )}
          {view === "pulsar" && (
            <motion.div
              key="pulsar"
              className="flex-1 flex flex-col min-h-0"
              {...slideIn}
            >
              <Suspense fallback={pageFallback}>
                <Pulsar />
              </Suspense>
            </motion.div>
          )}
          {view === "hyperlane" && (
            <motion.div
              key="hyperlane"
              className="flex-1 flex flex-col min-h-0"
              {...slideIn}
            >
              <Suspense fallback={pageFallback}>
                <Hyperlane />
              </Suspense>
            </motion.div>
          )}
          {view === "settings" && (
            <motion.div
              key="settings"
              className="flex-1 flex flex-col min-h-0"
              {...slideIn}
            >
              <Suspense fallback={pageFallback}>
                <Settings />
              </Suspense>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showConstellations && <ConstellationOverlay />}
        </AnimatePresence>

        {/* Wormhole launch transition — portal renders to document.body */}
        <AnimatePresence>
          {wormholeTarget && (
            <WormholeTransition
              key={wormholeTarget.id}
              accentHex={wormholeTarget.color}
              onNavigate={handleWormholeNavigate}
              onDone={handleWormholeDone}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>{!splashDone && <SplashScreen />}</AnimatePresence>
      </div>
    </div>
  );
}
