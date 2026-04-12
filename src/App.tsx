import {
  lazy,
  type ReactNode,
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
import type { AppView } from "./store/useAppStore";
import { getDeepSeekKey, getTavilyKey, getWeatherKey, win } from "./lib/tauri";
import { buildShortcutMap } from "./lib/constellation-catalog";

const SHORTCUT_MAP = buildShortcutMap();

// ── Lazy page imports (+ prefetch map) ────────────────────────────────────────

const pageImports: Record<
  string,
  () => Promise<{ default: React.ComponentType }>
> = {
  orbit: () => import("./pages/Orbit"),
  solaris: () => import("./pages/Solaris"),
  beacon: () => import("./pages/Beacon"),
  pulsar: () => import("./pages/Pulsar"),
  hyperlane: () => import("./pages/Hyperlane"),
  settings: () => import("./pages/Settings"),
};

const Orbit = lazy(pageImports.orbit);
const Solaris = lazy(pageImports.solaris);
const Beacon = lazy(pageImports.beacon);
const Pulsar = lazy(pageImports.pulsar);
const Hyperlane = lazy(pageImports.hyperlane);
const Settings = lazy(pageImports.settings);

/** Eagerly fetch a page module so it's cached before Suspense needs it. */
const prefetched = new Set<string>();
export function prefetchPage(view: AppView) {
  if (view === "luna" || prefetched.has(view)) return;
  prefetched.add(view);
  pageImports[view]?.();
}

const pageTransition = {
  initial: { opacity: 0, y: 6, filter: "blur(4px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)" },
  exit: { opacity: 0, y: -4, filter: "blur(2px)" },
  transition: {
    duration: 0.28,
    ease: [0.25, 0.1, 0.25, 1],
  },
};

/** Transition variant when arriving via wormhole — no entrance anim needed. */
const wormholeArrival = {
  initial: { opacity: 1, y: 0, filter: "blur(0px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)" },
  exit: { opacity: 0, y: -4, filter: "blur(2px)" },
  transition: { duration: 0.01 },
};

/** Animated Suspense fallback — fades in after a brief delay so fast loads flash nothing. */
function PageLoader() {
  return (
    <motion.div
      className="flex-1 flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3, delay: 0.15 }}
    >
      <div className="page-loader">
        <div className="page-loader-ring" />
      </div>
    </motion.div>
  );
}

/** Wraps a lazy page in a motion container + Suspense. */
function PageSlot({
  id,
  active,
  arrivedViaWormhole,
  children,
}: {
  id: string;
  active: boolean;
  arrivedViaWormhole: boolean;
  children: ReactNode;
}) {
  if (!active) return null;
  const variant = arrivedViaWormhole ? wormholeArrival : pageTransition;
  return (
    <motion.div key={id} className="flex-1 flex flex-col min-h-0" {...variant}>
      <Suspense fallback={<PageLoader />}>{children}</Suspense>
    </motion.div>
  );
}

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

  // Track whether the current page arrived via wormhole (suppress slideIn)
  const [arrivedViaWormhole, setArrivedViaWormhole] = useState(false);

  const handleWormholeNavigate = useCallback(() => {
    const target = wormholeTargetRef.current;
    if (target) {
      setArrivedViaWormhole(true);
      setView(target.id);
      closeConstellations();
    }
  }, [setView, closeConstellations]);

  const handleWormholeDone = useCallback(() => {
    clearWormhole();
  }, [clearWormhole]);

  // Prefetch the target page module as soon as the wormhole starts
  useEffect(() => {
    if (wormholeTarget) prefetchPage(wormholeTarget.id);
  }, [wormholeTarget]);

  // Reset the wormhole-arrival flag on the next *non-wormhole* navigation
  const prevView = useRef(view);
  useEffect(() => {
    if (view !== prevView.current) {
      // If the view changed but NOT because of a wormhole, clear the flag
      if (!wormholeTarget) setArrivedViaWormhole(false);
      prevView.current = view;
    }
  }, [view, wormholeTarget]);

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
        <TitleBar onPrefetchView={(v) => prefetchPage(v)} />
        <AnimatePresence mode="wait">
          <PageSlot
            id="luna"
            active={view === "luna"}
            arrivedViaWormhole={false}
          >
            <Luna />
          </PageSlot>
          <PageSlot
            id="orbit"
            active={view === "orbit"}
            arrivedViaWormhole={arrivedViaWormhole}
          >
            <Orbit />
          </PageSlot>
          <PageSlot
            id="solaris"
            active={view === "solaris"}
            arrivedViaWormhole={arrivedViaWormhole}
          >
            <Solaris />
          </PageSlot>
          <PageSlot
            id="beacon"
            active={view === "beacon"}
            arrivedViaWormhole={arrivedViaWormhole}
          >
            <Beacon />
          </PageSlot>
          <PageSlot
            id="pulsar"
            active={view === "pulsar"}
            arrivedViaWormhole={arrivedViaWormhole}
          >
            <Pulsar />
          </PageSlot>
          <PageSlot
            id="hyperlane"
            active={view === "hyperlane"}
            arrivedViaWormhole={arrivedViaWormhole}
          >
            <Hyperlane />
          </PageSlot>
          <PageSlot
            id="settings"
            active={view === "settings"}
            arrivedViaWormhole={false}
          >
            <Settings />
          </PageSlot>
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
