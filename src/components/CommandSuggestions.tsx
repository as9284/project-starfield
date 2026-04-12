import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Command } from "lucide-react";
import type { SlashCommand } from "../lib/slash-commands";

interface Props {
  /** Filtered list of matching commands. */
  commands: SlashCommand[];
  /** Currently highlighted index (-1 = none). */
  activeIndex: number;
  /** Called when the user clicks a suggestion. */
  onSelect: (cmd: SlashCommand) => void;
  /** Whether there is a resolved command with a pending arg hint. */
  argHint: string | null;
  /** Whether panel should be visible. */
  visible: boolean;
}

export function CommandSuggestions({
  commands,
  activeIndex,
  onSelect,
  argHint,
  visible,
}: Props) {
  const listRef = useRef<HTMLDivElement>(null);

  // Scroll the active item into view
  useEffect(() => {
    if (activeIndex < 0 || !listRef.current) return;
    const item = listRef.current.children[activeIndex] as
      | HTMLElement
      | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  return (
    <AnimatePresence>
      {visible && (commands.length > 0 || argHint) && (
        <motion.div
          className="luna-cmd-panel"
          initial={{ opacity: 0, y: 6, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 6, scale: 0.98 }}
          transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
        >
          {/* Command list */}
          {commands.length > 0 && (
            <div ref={listRef} className="luna-cmd-list">
              {commands.map((cmd, i) => {
                const Icon = cmd.icon;
                const isActive = i === activeIndex;
                return (
                  <button
                    key={cmd.name}
                    type="button"
                    className={`luna-cmd-item${isActive ? " luna-cmd-item-active" : ""}`}
                    onMouseDown={(e) => {
                      e.preventDefault(); // keep textarea focused
                      onSelect(cmd);
                    }}
                  >
                    <span
                      className="luna-cmd-icon"
                      style={{ color: cmd.accent }}
                    >
                      <Icon size={14} />
                    </span>
                    <span className="luna-cmd-name">/{cmd.name}</span>
                    <span className="luna-cmd-desc">{cmd.description}</span>
                    <span className="luna-cmd-example">{cmd.example}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Argument hint when a command is selected but args are incomplete */}
          {argHint && commands.length === 0 && (
            <div className="luna-cmd-hint">
              <Command size={11} />
              <span>{argHint}</span>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
