import { useState, useRef } from "react";
import { Eye, EyeOff, Save, Trash2, Download, Upload, X, Brain, Keyboard, Command } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import type { Memory } from "../store/useAppStore";
import { modKey } from "../lib/platform";
import {
  saveDeepSeekKey,
  deleteDeepSeekKey,
  saveTavilyKey,
  deleteTavilyKey,
  saveWeatherKey,
  deleteWeatherKey,
} from "../lib/tauri";

interface KeyFieldProps {
  label: string;
  placeholder: string;
  hasKey: boolean;
  onSave: (key: string) => Promise<void>;
  onDelete: () => Promise<void>;
}

function KeyField({
  label,
  placeholder,
  hasKey,
  onSave,
  onDelete,
}: KeyFieldProps) {
  const [value, setValue] = useState("");
  const [visible, setVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!value.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(value.trim());
      setValue("");
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setError(null);
    try {
      await onDelete();
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label
          className="text-sm font-medium"
          style={{ color: "var(--color-text-primary)" }}
        >
          {label}
        </label>
        {hasKey && (
          <span
            className="text-xs px-2 py-0.5 rounded"
            style={{
              background: "rgba(124,79,240,0.15)",
              color: "var(--color-purple-300)",
            }}
          >
            Saved
          </span>
        )}
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            className="settings-input pr-10"
            type={visible ? "text" : "password"}
            placeholder={hasKey ? "••••••••••••••••" : placeholder}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <button
            className="absolute right-3 top-1/2 -translate-y-1/2 win-btn"
            onClick={() => setVisible((v) => !v)}
            type="button"
            tabIndex={-1}
          >
            {visible ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
        </div>

        <button
          className="btn-send"
          style={{ width: 38, height: 38, borderRadius: "var(--radius-md)" }}
          onClick={() => void handleSave()}
          disabled={!value.trim() || saving}
          title="Save key"
        >
          <Save size={14} />
        </button>

        {hasKey && (
          <button
            className="win-btn win-btn-close"
            style={{
              width: 38,
              height: 38,
              borderRadius: "var(--radius-md)",
              opacity: 1,
            }}
            onClick={() => void handleDelete()}
            title="Remove key"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {error && (
        <p className="text-xs" style={{ color: "#f87171" }}>
          {error}
        </p>
      )}
    </div>
  );
}

export default function Settings() {
  const { hasDeepSeekKey, setHasDeepSeekKey, hasTavilyKey, setHasTavilyKey, hasWeatherKey, setHasWeatherKey, memories, removeMemory, clearMemories, importMemories } =
    useAppStore();

  const [confirmClear, setConfirmClear] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExportMemories = () => {
    const json = JSON.stringify(memories, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `luna-memories-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportMemories = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string) as Memory[];
        if (Array.isArray(data)) {
          importMemories(data);
        }
      } catch {
        // invalid JSON — silently ignore
      }
    };
    reader.readAsText(file);
    // reset input so re-selecting same file triggers change
    e.target.value = "";
  };

  const handleClearMemories = () => {
    if (confirmClear) {
      clearMemories();
      setConfirmClear(false);
    } else {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 3000);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6">
      <div className="max-w-lg mx-auto flex flex-col gap-8 animate-fade-up">
        <div>
          <h2
            className="text-lg font-semibold"
            style={{ color: "var(--color-text-primary)" }}
          >
            Settings
          </h2>
          <p
            className="mt-1 text-sm"
            style={{ color: "var(--color-text-secondary)" }}
          >
            API keys are stored securely in your OS keychain and never written
            to disk.
          </p>
        </div>

        {/* AI */}
        <section className="glass rounded-xl p-5 flex flex-col gap-5">
          <h3
            className="text-sm font-semibold uppercase tracking-widest"
            style={{ color: "var(--color-text-muted)" }}
          >
            AI — Luna (DeepSeek)
          </h3>

          <KeyField
            label="DeepSeek API Key"
            placeholder="sk-..."
            hasKey={hasDeepSeekKey}
            onSave={async (key) => {
              await saveDeepSeekKey(key);
              setHasDeepSeekKey(true);
            }}
            onDelete={async () => {
              await deleteDeepSeekKey();
              setHasDeepSeekKey(false);
            }}
          />

          <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
            Luna uses{" "}
            <span style={{ color: "var(--color-purple-300)" }}>
              DeepSeek-V3.2
            </span>{" "}
            in non-thinking mode via the official <code>deepseek-chat</code>{" "}
            alias, with thinking explicitly disabled in the request payload. Get
            a key at{" "}
            <a
              href="https://platform.deepseek.com"
              target="_blank"
              rel="noreferrer"
              style={{
                color: "var(--color-nebula-teal)",
                textDecoration: "underline",
              }}
            >
              platform.deepseek.com
            </a>
            .
          </p>
        </section>

        {/* Web search */}
        <section className="glass rounded-xl p-5 flex flex-col gap-5">
          <h3
            className="text-sm font-semibold uppercase tracking-widest"
            style={{ color: "var(--color-text-muted)" }}
          >
            Web Search — Tavily
          </h3>

          <KeyField
            label="Tavily API Key"
            placeholder="tvly-..."
            hasKey={hasTavilyKey}
            onSave={async (key) => {
              await saveTavilyKey(key);
              setHasTavilyKey(true);
            }}
            onDelete={async () => {
              await deleteTavilyKey();
              setHasTavilyKey(false);
            }}
          />

          <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
            Enable the web search toggle in Luna to let her fetch live results
            via Tavily. Get a free key at{" "}
            <a
              href="https://tavily.com"
              target="_blank"
              rel="noreferrer"
              style={{
                color: "var(--color-nebula-teal)",
                textDecoration: "underline",
              }}
            >
              tavily.com
            </a>
            .
          </p>
        </section>

        {/* Weather */}
        <section className="glass rounded-xl p-5 flex flex-col gap-5">
          <h3
            className="text-sm font-semibold uppercase tracking-widest"
            style={{ color: "var(--color-text-muted)" }}
          >
            Solaris — Weather API
          </h3>

          <KeyField
            label="Weather API Key"
            placeholder="Enter API key (optional)"
            hasKey={hasWeatherKey}
            onSave={async (key) => {
              await saveWeatherKey(key);
              setHasWeatherKey(true);
            }}
            onDelete={async () => {
              await deleteWeatherKey();
              setHasWeatherKey(false);
            }}
          />

          <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
            Solaris uses{" "}
            <span style={{ color: "var(--color-purple-300)" }}>
              Open-Meteo
            </span>{" "}
            for weather data, which is free and works without a key. An optional
            API key is available for commercial use or higher rate limits at{" "}
            <a
              href="https://open-meteo.com"
              target="_blank"
              rel="noreferrer"
              style={{
                color: "var(--color-nebula-teal)",
                textDecoration: "underline",
              }}
            >
              open-meteo.com
            </a>
            .
          </p>
        </section>

        {/* Memory */}
        <section className="glass rounded-xl p-5 flex flex-col gap-5">
          <h3
            className="text-sm font-semibold uppercase tracking-widest"
            style={{ color: "var(--color-text-muted)" }}
          >
            Luna — Memory
          </h3>

          <div className="flex items-center gap-3">
            <Brain size={16} style={{ color: "var(--color-purple-400)" }} />
            <span className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
              {memories.length} {memories.length === 1 ? "memory" : "memories"} stored
            </span>
          </div>

          <div className="flex gap-2 flex-wrap">
            <button
              className="luna-memory-action-btn"
              onClick={handleExportMemories}
              disabled={memories.length === 0}
              title="Export memories as JSON"
            >
              <Download size={13} />
              <span>Export</span>
            </button>
            <button
              className="luna-memory-action-btn"
              onClick={() => fileInputRef.current?.click()}
              title="Import memories from JSON"
            >
              <Upload size={13} />
              <span>Import</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleImportMemories}
              style={{ display: "none" }}
            />
            <button
              className="luna-memory-action-btn luna-memory-action-btn-danger"
              onClick={handleClearMemories}
              disabled={memories.length === 0}
              title="Clear all memories"
            >
              <Trash2 size={13} />
              <span>{confirmClear ? "Confirm?" : "Clear All"}</span>
            </button>
          </div>

          {memories.length > 0 && (
            <div className="luna-memory-list">
              {memories.slice(-10).reverse().map((mem) => (
                <div key={mem.id} className="luna-memory-item">
                  <span className="luna-memory-item-text">{mem.content}</span>
                  <button
                    className="luna-memory-item-delete"
                    onClick={() => removeMemory(mem.id)}
                    title="Remove memory"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
              {memories.length > 10 && (
                <p className="text-xs" style={{ color: "var(--color-text-dim)", textAlign: "center", marginTop: "0.25rem" }}>
                  …and {memories.length - 10} more
                </p>
              )}
            </div>
          )}

          <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
            Luna automatically extracts personal facts and preferences from your
            conversations. These memories help her provide more personalized
            responses.
          </p>
        </section>

        {/* Keyboard Shortcuts */}
        <section className="glass rounded-xl p-5 flex flex-col gap-5">
          <h3
            className="text-sm font-semibold uppercase tracking-widest flex items-center gap-2"
            style={{ color: "var(--color-text-muted)" }}
          >
            <Keyboard size={14} />
            Keyboard Shortcuts
          </h3>

          <div className="flex flex-col gap-1">
            <ShortcutRow keys={[modKey, "K"]} description="Open constellations" />
            <ShortcutRow keys={[modKey, ","]} description="Open settings" />
            <ShortcutRow keys={["Esc"]} description="Go back / close overlay" />
            <ShortcutRow keys={[modKey, "1"]} description="Go to Luna" />
            <ShortcutRow keys={[modKey, "2"]} description="Go to Orbit" />
            <ShortcutRow keys={[modKey, "3"]} description="Go to Solaris" />
            <ShortcutRow keys={[modKey, "4"]} description="Go to Beacon" />
            <ShortcutRow keys={[modKey, "5"]} description="Go to Hyperlane" />
            <ShortcutRow keys={[modKey, "6"]} description="Go to Pulsar" />
            <ShortcutRow keys={["Enter"]} description="Send message (in chat)" />
            <ShortcutRow keys={["Shift", "Enter"]} description="New line (in chat)" />
          </div>

          <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
            Shortcuts are disabled while typing in input fields or during AI
            streaming. On macOS, use <Command size={10} className="inline" /> Cmd; on
            Windows/Linux, use Ctrl.
          </p>
        </section>
      </div>
    </div>
  );
}

// ── Shortcut row helper ─────────────────────────────────────────────────────

function ShortcutRow({
  keys,
  description,
}: {
  keys: string[];
  description: string;
}) {
  return (
    <div
      className="flex items-center justify-between py-1.5"
      style={{ borderBottom: "1px solid rgba(37, 34, 96, 0.3)" }}
    >
      <span
        className="text-xs"
        style={{ color: "var(--color-text-secondary)" }}
      >
        {description}
      </span>
      <div className="flex items-center gap-1">
        {keys.map((key, i) => (
          <span key={i}>
            <kbd
              className="inline-block text-xs font-mono px-1.5 py-0.5 rounded"
              style={{
                background: "rgba(124, 79, 240, 0.1)",
                border: "1px solid rgba(124, 79, 240, 0.2)",
                color: "var(--color-purple-300)",
                fontSize: "0.68rem",
                minWidth: "1.5rem",
                textAlign: "center",
              }}
            >
              {key}
            </kbd>
            {i < keys.length - 1 && (
              <span
                className="text-xs mx-0.5"
                style={{ color: "var(--color-text-dim)" }}
              >
                +
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}
