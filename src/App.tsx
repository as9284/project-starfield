import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import TitleBar from "./components/TitleBar";
import ConstellationOverlay from "./components/ConstellationOverlay";
import SplashScreen from "./components/SplashScreen";
import Luna from "./pages/Luna";
import Orbit from "./pages/Orbit";
import Solaris from "./pages/Solaris";
import Beacon from "./pages/Beacon";
import Pulsar from "./pages/Pulsar";
import Hyperlane from "./pages/Hyperlane";
import Settings from "./pages/Settings";
import { useAppStore } from "./store/useAppStore";
import type { AppView } from "./store/useAppStore";
import { getDeepSeekKey, getTavilyKey, getWeatherKey, win } from "./lib/tauri";

const slideIn = {
  initial: { opacity: 0, x: 10 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -10 },
  transition: { duration: 0.2 },
};

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
  } = useAppStore();

  const [isMaximized, setIsMaximized] = useState(false);
  const [splashDone, setSplashDone] = useState(false);
  const splashStartRef = useRef(Date.now());
  // Minimum time the splash is visible (ms)
  const SPLASH_MIN_MS = 900;

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
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if user is typing in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      // Skip during AI streaming
      if (isStreaming) return;

      const isMod = e.ctrlKey || e.metaKey;

      // Escape: go back (close constellations if open, else go back)
      if (e.key === "Escape") {
        if (showConstellations) {
          // ConstellationOverlay already handles its own Escape,
          // but this catches it globally too
          return;
        }
        if (view !== "luna") {
          e.preventDefault();
          goBack();
        }
        return;
      }

      // Ctrl/Cmd+K: toggle constellations
      if (isMod && e.key === "k") {
        e.preventDefault();
        toggleConstellations();
        return;
      }

      // Ctrl/Cmd+,: settings
      if (isMod && e.key === ",") {
        e.preventDefault();
        setView("settings");
        return;
      }

      // Ctrl/Cmd + number: jump to constellation
      if (isMod && !e.shiftKey && !e.altKey) {
        const constellationMap: Record<string, AppView> = {
          "1": "luna",
          "2": "orbit",
          "3": "solaris",
          "4": "beacon",
          "5": "hyperlane",
          "6": "pulsar",
        };
        const target = constellationMap[e.key];
        if (target) {
          e.preventDefault();
          setView(target);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    view,
    showConstellations,
    isStreaming,
    goBack,
    setView,
    toggleConstellations,
  ]);

  return (
    <div
      className={`window-frame${isMaximized ? " window-frame-maximized" : ""}`}
    >
      <div className="app-shell bg-cosmic">
        <TitleBar />
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
              <Orbit />
            </motion.div>
          )}
          {view === "solaris" && (
            <motion.div
              key="solaris"
              className="flex-1 flex flex-col min-h-0"
              {...slideIn}
            >
              <Solaris />
            </motion.div>
          )}
          {view === "beacon" && (
            <motion.div
              key="beacon"
              className="flex-1 flex flex-col min-h-0"
              {...slideIn}
            >
              <Beacon />
            </motion.div>
          )}
          {view === "pulsar" && (
            <motion.div
              key="pulsar"
              className="flex-1 flex flex-col min-h-0"
              {...slideIn}
            >
              <Pulsar />
            </motion.div>
          )}
          {view === "hyperlane" && (
            <motion.div
              key="hyperlane"
              className="flex-1 flex flex-col min-h-0"
              {...slideIn}
            >
              <Hyperlane />
            </motion.div>
          )}
          {view === "settings" && (
            <motion.div
              key="settings"
              className="flex-1 flex flex-col min-h-0"
              {...slideIn}
            >
              <Settings />
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showConstellations && <ConstellationOverlay />}
        </AnimatePresence>

        <AnimatePresence>{!splashDone && <SplashScreen />}</AnimatePresence>
      </div>
    </div>
  );
}
