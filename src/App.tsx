import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import TitleBar from "./components/TitleBar";
import Home from "./pages/Home";
import Luna from "./pages/Luna";
import Settings from "./pages/Settings";
import { useAppStore } from "./store/useAppStore";
import { getDeepSeekKey, getTavilyKey } from "./lib/tauri";

export default function App() {
  const { view, setHasDeepSeekKey, setHasTavilyKey } = useAppStore();

  // Bootstrap: check if API keys are already stored in the keychain
  useEffect(() => {
    getDeepSeekKey()
      .then((k) => setHasDeepSeekKey(!!k))
      .catch(() => setHasDeepSeekKey(false));

    getTavilyKey()
      .then((k) => setHasTavilyKey(!!k))
      .catch(() => setHasTavilyKey(false));
  }, [setHasDeepSeekKey, setHasTavilyKey]);

  return (
    <div className="app-shell bg-cosmic">
      <TitleBar />
      <AnimatePresence mode="wait">
        {view === "home" && (
          <motion.div
            key="home"
            className="flex-1 flex flex-col min-h-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <Home />
          </motion.div>
        )}
        {view === "luna" && (
          <motion.div
            key="luna"
            className="flex-1 flex flex-col min-h-0"
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.2 }}
          >
            <Luna />
          </motion.div>
        )}
        {view === "settings" && (
          <motion.div
            key="settings"
            className="flex-1 flex flex-col min-h-0"
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.2 }}
          >
            <Settings />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
