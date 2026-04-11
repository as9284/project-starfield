import { motion } from "framer-motion";

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export function Switch({
  checked,
  onChange,
  label,
  icon,
  disabled = false,
}: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => !disabled && onChange(!checked)}
      className={`luna-switch ${disabled ? "luna-switch-disabled" : ""}`}
    >
      {label && (
        <span
          className={`luna-switch-label ${checked ? "luna-switch-label-on" : ""}`}
        >
          {icon}
          {label}
        </span>
      )}
      <div
        className={`luna-switch-track ${checked ? "luna-switch-track-on" : ""}`}
      >
        <motion.div
          className="luna-switch-thumb"
          animate={{ x: checked ? 16 : 0 }}
          transition={{
            type: "spring",
            stiffness: 500,
            damping: 30,
            mass: 0.6,
          }}
        >
          {checked && (
            <motion.div
              className="luna-switch-glow"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.2 }}
            />
          )}
        </motion.div>
      </div>
    </button>
  );
}
