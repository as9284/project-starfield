import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, X } from "lucide-react";

interface ConfirmDeleteModalProps {
  title: string;
  itemTitle: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDeleteModal({
  title,
  itemTitle,
  onConfirm,
  onCancel,
}: ConfirmDeleteModalProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmRef.current?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onCancel]);

  return (
    <motion.div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: "rgba(6, 6, 14, 0.8)" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <motion.div
        className="glass rounded-2xl w-full max-w-sm p-6 flex flex-col gap-4"
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.92, opacity: 0 }}
        transition={{ duration: 0.15 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div
            className="p-2.5 rounded-xl shrink-0"
            style={{ background: "rgba(248, 113, 113, 0.12)" }}
          >
            <AlertTriangle
              size={18}
              style={{ color: "rgba(248, 113, 113, 0.9)" }}
            />
          </div>
          <div className="flex-1 min-w-0">
            <h3
              className="text-sm font-semibold mb-1"
              style={{ color: "var(--color-text-primary)" }}
            >
              {title}
            </h3>
            <p
              className="text-xs line-clamp-2"
              style={{ color: "var(--color-text-muted)" }}
            >
              &ldquo;{itemTitle}&rdquo; will be permanently deleted.
            </p>
          </div>
          <button
            onClick={onCancel}
            className="shrink-0 p-1 rounded-lg transition-colors"
            style={{ color: "var(--color-text-muted)" }}
          >
            <X size={14} />
          </button>
        </div>

        <div className="flex gap-2.5">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl text-sm transition-all duration-150"
            style={{
              border: "1px solid var(--color-border-dim)",
              color: "var(--color-text-muted)",
            }}
          >
            Cancel
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150"
            style={{
              background: "rgba(248, 113, 113, 0.2)",
              border: "1px solid rgba(248, 113, 113, 0.4)",
              color: "rgba(248, 113, 113, 0.9)",
            }}
          >
            Delete
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
