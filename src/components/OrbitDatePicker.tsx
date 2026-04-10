import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Calendar, ChevronLeft, ChevronRight, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const DAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

interface OrbitDatePickerProps {
  value: string; // YYYY-MM-DD or ""
  onChange: (value: string) => void;
  placeholder?: string;
}

export function OrbitDatePicker({
  value,
  onChange,
  placeholder = "Pick a date…",
}: OrbitDatePickerProps) {
  const today = new Date();
  const parsed = value ? new Date(value + "T00:00:00") : null;

  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(
    parsed?.getFullYear() ?? today.getFullYear(),
  );
  const [viewMonth, setViewMonth] = useState(
    parsed?.getMonth() ?? today.getMonth(),
  );
  const [dropPos, setDropPos] = useState({ top: 0, left: 0, width: 0 });

  const triggerRef = useRef<HTMLButtonElement>(null);
  const calendarRef = useRef<HTMLDivElement>(null);

  // Sync view when value is set externally
  useEffect(() => {
    if (parsed) {
      setViewYear(parsed.getFullYear());
      setViewMonth(parsed.getMonth());
    }
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        calendarRef.current &&
        !calendarRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleToggle = useCallback(() => {
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const calHeight = 290;
      const spaceBelow = window.innerHeight - rect.bottom;
      const top =
        spaceBelow > calHeight ? rect.bottom + 6 : rect.top - calHeight - 6;
      setDropPos({ top, left: rect.left, width: rect.width });
    }
    setOpen((v) => !v);
  }, [open]);

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else setViewMonth((m) => m - 1);
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else setViewMonth((m) => m + 1);
  };

  const handleSelect = (day: number) => {
    const d = new Date(viewYear, viewMonth, day);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    onChange(`${yyyy}-${mm}-${dd}`);
    setOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange("");
  };

  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const totalDays = new Date(viewYear, viewMonth + 1, 0).getDate();

  const selectedDay =
    parsed &&
    parsed.getFullYear() === viewYear &&
    parsed.getMonth() === viewMonth
      ? parsed.getDate()
      : null;

  const displayValue = parsed
    ? parsed.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  const calendar = (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={calendarRef}
          initial={{ opacity: 0, y: -6, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6, scale: 0.97 }}
          transition={{ duration: 0.15 }}
          style={{
            position: "fixed",
            top: dropPos.top,
            left: dropPos.left,
            zIndex: 9999,
            width: Math.max(dropPos.width, 228),
            background: "rgba(10, 9, 28, 0.98)",
            border: "1px solid rgba(55, 50, 120, 0.8)",
            backdropFilter: "blur(32px)",
            WebkitBackdropFilter: "blur(32px)",
            borderRadius: 14,
            padding: "12px 10px",
            boxShadow:
              "0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(124, 79, 240, 0.08)",
          }}
        >
          {/* Month navigation */}
          <div className="flex items-center justify-between mb-3 px-1">
            <button
              type="button"
              onClick={prevMonth}
              className="p-1.5 rounded-lg transition-colors"
              style={{ color: "var(--color-text-secondary)" }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background =
                  "rgba(255,255,255,0.06)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "";
              }}
            >
              <ChevronLeft size={13} />
            </button>
            <span
              className="text-xs font-semibold"
              style={{ color: "var(--color-text-primary)" }}
            >
              {MONTHS[viewMonth]} {viewYear}
            </span>
            <button
              type="button"
              onClick={nextMonth}
              className="p-1.5 rounded-lg transition-colors"
              style={{ color: "var(--color-text-secondary)" }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background =
                  "rgba(255,255,255,0.06)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "";
              }}
            >
              <ChevronRight size={13} />
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 mb-1">
            {DAY_LABELS.map((d) => (
              <span
                key={d}
                className="text-center text-[10px] font-semibold py-1"
                style={{ color: "rgba(155, 120, 248, 0.45)" }}
              >
                {d}
              </span>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-y-0.5">
            {Array.from({ length: firstDay }, (_, i) => (
              <div key={`e-${i}`} />
            ))}
            {Array.from({ length: totalDays }, (_, i) => {
              const day = i + 1;
              const isSelected = selectedDay === day;
              const isToday =
                today.getFullYear() === viewYear &&
                today.getMonth() === viewMonth &&
                today.getDate() === day;

              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => handleSelect(day)}
                  className="flex items-center justify-center rounded-lg text-[11px] h-8 transition-all duration-100"
                  style={{
                    background: isSelected
                      ? "rgba(124, 79, 240, 0.55)"
                      : isToday
                        ? "rgba(124, 79, 240, 0.1)"
                        : "transparent",
                    border:
                      isToday && !isSelected
                        ? "1px solid rgba(124, 79, 240, 0.35)"
                        : "1px solid transparent",
                    color: isSelected
                      ? "#fff"
                      : isToday
                        ? "rgba(196, 168, 255, 0.95)"
                        : "rgba(196, 184, 240, 0.65)",
                    fontWeight: isSelected ? 700 : isToday ? 600 : 400,
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected)
                      (e.currentTarget as HTMLElement).style.background =
                        "rgba(255,255,255,0.06)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected)
                      (e.currentTarget as HTMLElement).style.background =
                        isToday ? "rgba(124, 79, 240, 0.1)" : "transparent";
                  }}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggle}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-left transition-all duration-150"
        style={{
          background: "rgba(13, 12, 34, 0.8)",
          border: `1px solid ${open ? "rgba(124, 79, 240, 0.45)" : "var(--color-border-dim)"}`,
          color: displayValue
            ? "var(--color-text-primary)"
            : "var(--color-text-muted)",
          boxShadow: open ? "0 0 0 3px rgba(124, 79, 240, 0.08)" : "none",
        }}
      >
        <Calendar
          size={11}
          style={{
            color: displayValue
              ? "rgba(155, 120, 248, 0.75)"
              : "rgba(155, 120, 248, 0.3)",
            flexShrink: 0,
          }}
        />
        <span className="flex-1 truncate">{displayValue ?? placeholder}</span>
        {value && (
          <span
            role="button"
            onClick={handleClear}
            className="shrink-0 flex items-center opacity-40 hover:opacity-80 transition-opacity cursor-pointer"
            style={{ color: "var(--color-text-muted)" }}
          >
            <X size={10} />
          </span>
        )}
      </button>
      {typeof document !== "undefined" && createPortal(calendar, document.body)}
    </div>
  );
}
