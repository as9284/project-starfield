import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import TitleBar from "./components/TitleBar";
import Home from "./pages/Home";
import Luna from "./pages/Luna";
import Orbit from "./pages/Orbit";
import Solaris from "./pages/Solaris";
import Beacon from "./pages/Beacon";
import Pulsar from "./pages/Pulsar";
import Hyperlane from "./pages/Hyperlane";
import Settings from "./pages/Settings";
import { useAppStore } from "./store/useAppStore";
import { getDeepSeekKey, getTavilyKey } from "./lib/tauri";

const slideIn = {
  initial: { opacity: 0, x: 10 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -10 },
  transition: { duration: 0.2 },
};

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
          <motion.div key="luna" className="flex-1 flex flex-col min-h-0" {...slideIn}>
            <Luna />
          </motion.div>
        )}
        {view === "orbit" && (
          <motion.div key="orbit" className="flex-1 flex flex-col min-h-0" {...slideIn}>
            <Orbit />
          </motion.div>
        )}
        {view === "solaris" && (
          <motion.div key="solaris" className="flex-1 flex flex-col min-h-0" {...slideIn}>
            <Solaris />
          </motion.div>
        )}
        {view === "beacon" && (
          <motion.div key="beacon" className="flex-1 flex flex-col min-h-0" {...slideIn}>
            <Beacon />
          </motion.div>
        )}
        {view === "pulsar" && (
          <motion.div key="pulsar" className="flex-1 flex flex-col min-h-0" {...slideIn}>
            <Pulsar />
          </motion.div>
        )}
        {view === "hyperlane" && (
          <motion.div key="hyperlane" className="flex-1 flex flex-col min-h-0" {...slideIn}>
            <Hyperlane />
          </motion.div>
        )}
        {view === "settings" && (
          <motion.div key="settings" className="flex-1 flex flex-col min-h-0" {...slideIn}>
            <Settings />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
