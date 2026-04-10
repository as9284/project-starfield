import { useState, useRef, useEffect, useMemo } from "react";
import {
  Eye,
  EyeOff,
  Save,
  Trash2,
  Download,
  Upload,
  X,
  Brain,
  Keyboard,
  Command,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Package,
  RefreshCw,
  Rocket,
  Search,
  Cloud,
  Globe,
  Cpu,
  Zap,
  Settings as SettingsIcon,
} from "lucide-react";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
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
  pulsarCheckYtdlp,
  pulsarInstallYtdlp,
} from "../lib/tauri";

// ── Section IDs ─────────────────────────────────────────────────────────────

type SectionId =
  | "updates"
  | "ai"
  | "websearch"
  | "weather"
  | "pulsar"
  | "memory"
  | "shortcuts";

const SECTIONS: {
  id: SectionId;
  label: string;
  icon: React.ElementType;
  keywords: string[];
}[] = [
  {
    id: "updates",
    label: "App Updates",
    icon: RefreshCw,
    keywords: ["update", "version", "download", "install", "restart", "relaunch"],
  },
  {
    id: "ai",
    label: "AI — Luna",
    icon: Cpu,
    keywords: ["ai", "luna", "deepseek", "api key", "sk-", "chat", "model"],
  },
  {
    id: "websearch",
    label: "Web Search",
    icon: Globe,
    keywords: ["web", "search", "tavily", "tvly", "browse", "internet"],
  },
  {
    id: "weather",
    label: "Solaris",
    icon: Cloud,
    keywords: ["weather", "solaris", "open-meteo", "forecast", "temperature"],
  },
  {
    id: "pulsar",
    label: "Pulsar",
    icon: Zap,
    keywords: ["pulsar", "yt-dlp", "ytdlp", "video", "audio", "download", "media"],
  },
  {
    id: "memory",
    label: "Memory",
    icon: Brain,
    keywords: ["memory", "memories", "export", "import", "clear", "personal"],
  },
  {
    id: "shortcuts",
    label: "Shortcuts",
    icon: Keyboard,
    keywords: ["keyboard", "shortcut", "hotkey", "keybind", "ctrl", "cmd"],
  },
];

// ── KeyField component ───────────────────────────────────────────────────────

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
          <span className="settings-key-badge">
            <CheckCircle2 size={11} />
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
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleSave();
            }}
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
          className="settings-action-btn settings-action-btn-primary"
          onClick={() => void handleSave()}
          disabled={!value.trim() || saving}
          title="Save key"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Save
        </button>

        {hasKey && (
          <button
            className="settings-action-btn settings-action-btn-danger"
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

// ── Section header helper ────────────────────────────────────────────────────

function SectionHeader({
  icon: Icon,
  label,
  color,
}: {
  icon: React.ElementType;
  label: string;
  color: "purple" | "teal" | "blue" | "pink";
}) {
  const colorMap = {
    purple: {
      bg: "rgba(124, 79, 240, 0.12)",
      border: "rgba(124, 79, 240, 0.25)",
      iconColor: "var(--color-purple-400)",
    },
    teal: {
      bg: "rgba(20, 184, 166, 0.1)",
      border: "rgba(20, 184, 166, 0.25)",
      iconColor: "var(--color-nebula-teal)",
    },
    blue: {
      bg: "rgba(99, 102, 241, 0.1)",
      border: "rgba(99, 102, 241, 0.25)",
      iconColor: "var(--color-nebula-blue)",
    },
    pink: {
      bg: "rgba(217, 70, 239, 0.1)",
      border: "rgba(217, 70, 239, 0.25)",
      iconColor: "var(--color-nebula-pink)",
    },
  };
  const c = colorMap[color];
  return (
    <div className="settings-section-header">
      <span
        className="settings-section-icon"
        style={{ background: c.bg, border: `1px solid ${c.border}` }}
      >
        <Icon size={14} style={{ color: c.iconColor }} />
      </span>
      <h3 className="settings-section-title">{label}</h3>
    </div>
  );
}

// ── Shortcut row helper ──────────────────────────────────────────────────────

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
      <span className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
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
                fontSize: "0.72rem",
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

// ── Main Settings component ──────────────────────────────────────────────────

export default function Settings() {
  const {
    hasDeepSeekKey,
    setHasDeepSeekKey,
    hasTavilyKey,
    setHasTavilyKey,
    hasWeatherKey,
    setHasWeatherKey,
    memories,
    removeMemory,
    clearMemories,
    importMemories,
  } = useAppStore();

  const [confirmClear, setConfirmClear] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [activeSection, setActiveSection] = useState<SectionId>("updates");
  const sectionRefs = useRef<Partial<Record<SectionId, HTMLElement | null>>>({});
  const contentRef = useRef<HTMLDivElement>(null);

  // ── yt-dlp status ──────────────────────────────────────────────────────────
  const [ytdlpStatus, setYtdlpStatus] = useState<
    "checking" | "found" | "missing" | "installing" | "failed"
  >("checking");

  useEffect(() => {
    pulsarCheckYtdlp()
      .then((found) => setYtdlpStatus(found ? "found" : "missing"))
      .catch(() => setYtdlpStatus("missing"));
  }, []);

  const handleInstallYtdlp = async () => {
    setYtdlpStatus("installing");
    try {
      const ok = await pulsarInstallYtdlp();
      setYtdlpStatus(ok ? "found" : "failed");
    } catch {
      setYtdlpStatus("failed");
    }
  };

  // ── App updates ────────────────────────────────────────────────────────────
  const [updateStatus, setUpdateStatus] = useState<
    | "idle"
    | "checking"
    | "available"
    | "downloading"
    | "ready"
    | "up-to-date"
    | "error"
  >("idle");
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);
  const [updateProgress, setUpdateProgress] = useState(0);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const updateRef = useRef<Awaited<ReturnType<typeof check>> | null>(null);

  const handleCheckUpdate = async () => {
    setUpdateStatus("checking");
    setUpdateError(null);
    try {
      const update = await check();
      if (update) {
        updateRef.current = update;
        setUpdateVersion(update.version);
        setUpdateStatus("available");
      } else {
        setUpdateStatus("up-to-date");
      }
    } catch (e) {
      setUpdateError(String(e));
      setUpdateStatus("error");
    }
  };

  const handleDownloadAndInstall = async () => {
    const update = updateRef.current;
    if (!update) return;
    setUpdateStatus("downloading");
    setUpdateProgress(0);
    try {
      let totalBytes = 0;
      let downloadedBytes = 0;
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          totalBytes = event.data.contentLength ?? 0;
        } else if (event.event === "Progress") {
          downloadedBytes += event.data.chunkLength;
          if (totalBytes > 0) {
            setUpdateProgress(Math.round((downloadedBytes / totalBytes) * 100));
          }
        } else if (event.event === "Finished") {
          setUpdateProgress(100);
        }
      });
      setUpdateStatus("ready");
    } catch (e) {
      setUpdateError(String(e));
      setUpdateStatus("error");
    }
  };

  const handleRelaunch = async () => {
    await relaunch();
  };

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

  // ── Search filtering ───────────────────────────────────────────────────────
  const q = query.toLowerCase().trim();
  const visibleSections = useMemo(() => {
    if (!q) return SECTIONS;
    return SECTIONS.filter(
      (s) =>
        s.label.toLowerCase().includes(q) ||
        s.keywords.some((k) => k.includes(q))
    );
  }, [q]);

  // ── Scroll-spy for active section ──────────────────────────────────────────
  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;
    const onScroll = () => {
      for (const sec of [...SECTIONS].reverse()) {
        const el = sectionRefs.current[sec.id];
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        if (rect.top - containerRect.top <= containerRect.height * 0.4) {
          setActiveSection(sec.id);
          break;
        }
      }
    };
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, []);

  const scrollToSection = (id: SectionId) => {
    const el = sectionRefs.current[id];
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveSection(id);
  };

  return (
    <div className="settings-shell">
      {/* ── Left sidebar ───────────────────────────────────────────────────── */}
      <aside className="settings-sidebar">
        {/* Header */}
        <div className="settings-sidebar-header">
          <div className="settings-sidebar-title-row">
            <SettingsIcon size={16} style={{ color: "var(--color-purple-400)" }} />
            <span className="settings-sidebar-title">Settings</span>
          </div>
          <p className="settings-sidebar-subtitle">
            Keys are stored in your OS keychain
          </p>
        </div>

        {/* Search */}
        <div className="settings-search-wrap">
          <Search size={13} className="settings-search-icon" />
          <input
            className="settings-search-input"
            placeholder="Search settings…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button
              className="settings-search-clear"
              onClick={() => setQuery("")}
              tabIndex={-1}
            >
              <X size={12} />
            </button>
          )}
        </div>

        {/* Navigation */}
        <nav className="settings-nav">
          {visibleSections.map((sec) => {
            const Icon = sec.icon;
            const isActive = activeSection === sec.id && !q;
            return (
              <button
                key={sec.id}
                className={`settings-nav-item${isActive ? " settings-nav-item-active" : ""}`}
                onClick={() => {
                  setQuery("");
                  scrollToSection(sec.id);
                }}
              >
                <span className="settings-nav-item-icon">
                  <Icon size={14} />
                </span>
                <span className="settings-nav-item-label">{sec.label}</span>
              </button>
            );
          })}
          {visibleSections.length === 0 && (
            <p className="settings-nav-empty">No results for &ldquo;{query}&rdquo;</p>
          )}
        </nav>
      </aside>

      {/* ── Main content ───────────────────────────────────────────────────── */}
      <div className="settings-content" ref={contentRef}>
        <div className="settings-content-inner">

          {/* ── App Updates ─────────────────────────────────────────── */}
          {visibleSections.some((s) => s.id === "updates") && (
            <section
              id="settings-updates"
              ref={(el) => { sectionRefs.current["updates"] = el; }}
              className="settings-section"
            >
              <SectionHeader icon={RefreshCw} label="App Updates" color="purple" />

              <div className="settings-update-row">
                <div className="settings-update-status">
                  {updateStatus === "checking" || updateStatus === "downloading" ? (
                    <Loader2
                      size={15}
                      className="animate-spin"
                      style={{ color: "var(--color-purple-400)", flexShrink: 0 }}
                    />
                  ) : updateStatus === "up-to-date" ? (
                    <CheckCircle2 size={15} style={{ color: "#86efac", flexShrink: 0 }} />
                  ) : updateStatus === "available" ? (
                    <Rocket size={15} style={{ color: "var(--color-nebula-teal)", flexShrink: 0 }} />
                  ) : updateStatus === "ready" ? (
                    <CheckCircle2 size={15} style={{ color: "#86efac", flexShrink: 0 }} />
                  ) : updateStatus === "error" ? (
                    <AlertCircle size={15} style={{ color: "#fca5a5", flexShrink: 0 }} />
                  ) : (
                    <RefreshCw size={15} style={{ color: "var(--color-text-muted)", flexShrink: 0 }} />
                  )}
                  <span
                    className="settings-update-status-text"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    {updateStatus === "checking"
                      ? "Checking for updates…"
                      : updateStatus === "downloading"
                        ? `Downloading v${updateVersion}… ${updateProgress}%`
                        : updateStatus === "available"
                          ? `v${updateVersion} available`
                          : updateStatus === "up-to-date"
                            ? "You're on the latest version"
                            : updateStatus === "ready"
                              ? `v${updateVersion} ready — restart to apply`
                              : updateStatus === "error"
                                ? "Update check failed"
                                : "v1.0.0"}
                  </span>
                </div>

                <div className="settings-update-actions">
                  {(updateStatus === "idle" ||
                    updateStatus === "up-to-date" ||
                    updateStatus === "error") && (
                    <button
                      className="settings-update-button"
                      onClick={() => void handleCheckUpdate()}
                    >
                      <RefreshCw size={14} />
                      Check for updates
                    </button>
                  )}
                  {updateStatus === "available" && (
                    <button
                      className="settings-update-button"
                      onClick={() => void handleDownloadAndInstall()}
                    >
                      <Download size={14} />
                      Download &amp; install
                    </button>
                  )}
                  {updateStatus === "ready" && (
                    <button
                      className="settings-update-button"
                      onClick={() => void handleRelaunch()}
                    >
                      <Rocket size={14} />
                      Restart now
                    </button>
                  )}
                </div>
              </div>

              {updateStatus === "downloading" && (
                <div
                  className="h-1.5 rounded-full overflow-hidden"
                  style={{ background: "rgba(124, 79, 240, 0.15)" }}
                >
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${updateProgress}%`,
                      background: "var(--color-purple-400)",
                    }}
                  />
                </div>
              )}

              {updateError && (
                <p className="text-xs" style={{ color: "#fca5a5" }}>
                  {updateError}
                </p>
              )}

              <p className="settings-desc">
                Starfield checks for new versions from GitHub releases. Updates are
                downloaded and applied seamlessly — just restart when ready.
              </p>
            </section>
          )}

          {/* ── AI — Luna ───────────────────────────────────────────── */}
          {visibleSections.some((s) => s.id === "ai") && (
            <section
              id="settings-ai"
              ref={(el) => { sectionRefs.current["ai"] = el; }}
              className="settings-section"
            >
              <SectionHeader icon={Cpu} label="AI — Luna (DeepSeek)" color="purple" />

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

              <p className="settings-desc">
                Luna uses{" "}
                <span style={{ color: "var(--color-purple-300)" }}>
                  DeepSeek-V3.2
                </span>{" "}
                in non-thinking mode via the official <code>deepseek-chat</code>{" "}
                alias, with thinking explicitly disabled. Get a key at{" "}
                <a
                  href="https://platform.deepseek.com"
                  target="_blank"
                  rel="noreferrer"
                  className="settings-link"
                >
                  platform.deepseek.com
                </a>
                .
              </p>
            </section>
          )}

          {/* ── Web Search — Tavily ─────────────────────────────────── */}
          {visibleSections.some((s) => s.id === "websearch") && (
            <section
              id="settings-websearch"
              ref={(el) => { sectionRefs.current["websearch"] = el; }}
              className="settings-section"
            >
              <SectionHeader icon={Globe} label="Web Search — Tavily" color="teal" />

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

              <p className="settings-desc">
                Enable the web search toggle in Luna to let her fetch live results
                via Tavily. Get a free key at{" "}
                <a
                  href="https://tavily.com"
                  target="_blank"
                  rel="noreferrer"
                  className="settings-link"
                >
                  tavily.com
                </a>
                .
              </p>
            </section>
          )}

          {/* ── Solaris — Weather API ───────────────────────────────── */}
          {visibleSections.some((s) => s.id === "weather") && (
            <section
              id="settings-weather"
              ref={(el) => { sectionRefs.current["weather"] = el; }}
              className="settings-section"
            >
              <SectionHeader icon={Cloud} label="Solaris — Weather API" color="blue" />

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

              <p className="settings-desc">
                Solaris uses{" "}
                <span style={{ color: "var(--color-purple-300)" }}>Open-Meteo</span>{" "}
                for weather data, which is free and works without a key. An optional
                key is available for commercial use at{" "}
                <a
                  href="https://open-meteo.com"
                  target="_blank"
                  rel="noreferrer"
                  className="settings-link"
                >
                  open-meteo.com
                </a>
                .
              </p>
            </section>
          )}

          {/* ── Pulsar — yt-dlp ────────────────────────────────────── */}
          {visibleSections.some((s) => s.id === "pulsar") && (
            <section
              id="settings-pulsar"
              ref={(el) => { sectionRefs.current["pulsar"] = el; }}
              className="settings-section"
            >
              <SectionHeader icon={Zap} label="Pulsar — yt-dlp" color="pink" />

              <div className="settings-ytdlp-row">
                <div className="settings-ytdlp-status">
                  {ytdlpStatus === "checking" || ytdlpStatus === "installing" ? (
                    <Loader2
                      size={16}
                      className="animate-spin"
                      style={{ color: "var(--color-purple-400)", flexShrink: 0 }}
                    />
                  ) : ytdlpStatus === "found" ? (
                    <CheckCircle2 size={16} style={{ color: "#86efac", flexShrink: 0 }} />
                  ) : (
                    <AlertCircle size={16} style={{ color: "#fca5a5", flexShrink: 0 }} />
                  )}
                  <div className="settings-ytdlp-text">
                    <span className="settings-ytdlp-label">
                      {ytdlpStatus === "checking"
                        ? "Checking…"
                        : ytdlpStatus === "installing"
                          ? "Downloading yt-dlp…"
                          : ytdlpStatus === "found"
                            ? "yt-dlp is installed"
                            : ytdlpStatus === "failed"
                              ? "Installation failed"
                              : "yt-dlp not found"}
                    </span>
                    <span className="settings-ytdlp-sublabel">
                      {ytdlpStatus === "found"
                        ? "Ready to download media"
                        : ytdlpStatus === "checking" || ytdlpStatus === "installing"
                          ? "Please wait…"
                          : "Required for media downloads"}
                    </span>
                  </div>
                </div>

                {(ytdlpStatus === "missing" || ytdlpStatus === "failed") && (
                  <button
                    className="settings-ytdlp-install-btn"
                    onClick={() => void handleInstallYtdlp()}
                  >
                    <Package size={14} />
                    {ytdlpStatus === "failed" ? "Retry install" : "Auto-install yt-dlp"}
                  </button>
                )}
              </div>

              <p className="settings-desc">
                Pulsar requires{" "}
                <a
                  href="https://github.com/yt-dlp/yt-dlp#installation"
                  target="_blank"
                  rel="noreferrer"
                  className="settings-link"
                >
                  yt-dlp
                </a>{" "}
                to download videos and audio. On Windows the binary is downloaded
                directly from GitHub; on other platforms pip is used. You can also
                install it manually via your package manager.
              </p>
            </section>
          )}

          {/* ── Luna — Memory ───────────────────────────────────────── */}
          {visibleSections.some((s) => s.id === "memory") && (
            <section
              id="settings-memory"
              ref={(el) => { sectionRefs.current["memory"] = el; }}
              className="settings-section"
            >
              <SectionHeader icon={Brain} label="Luna — Memory" color="purple" />

              <div className="settings-memory-count">
                <Brain size={14} style={{ color: "var(--color-purple-400)" }} />
                <span>
                  <strong style={{ color: "var(--color-text-primary)" }}>
                    {memories.length}
                  </strong>{" "}
                  {memories.length === 1 ? "memory" : "memories"} stored
                </span>
              </div>

              <div className="settings-memory-actions">
                <button
                  className="settings-action-btn settings-action-btn-secondary"
                  onClick={handleExportMemories}
                  disabled={memories.length === 0}
                  title="Export memories as JSON"
                >
                  <Download size={13} />
                  Export
                </button>
                <button
                  className="settings-action-btn settings-action-btn-secondary"
                  onClick={() => fileInputRef.current?.click()}
                  title="Import memories from JSON"
                >
                  <Upload size={13} />
                  Import
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  onChange={handleImportMemories}
                  style={{ display: "none" }}
                />
                <button
                  className="settings-action-btn settings-action-btn-danger"
                  onClick={handleClearMemories}
                  disabled={memories.length === 0}
                  title="Clear all memories"
                >
                  <Trash2 size={13} />
                  {confirmClear ? "Confirm?" : "Clear All"}
                </button>
              </div>

              {memories.length > 0 && (
                <div className="luna-memory-list">
                  {memories
                    .slice(-10)
                    .reverse()
                    .map((mem) => (
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
                    <p
                      className="text-xs"
                      style={{
                        color: "var(--color-text-secondary)",
                        textAlign: "center",
                        marginTop: "0.25rem",
                      }}
                    >
                      …and {memories.length - 10} more
                    </p>
                  )}
                </div>
              )}

              <p className="settings-desc">
                Luna automatically extracts personal facts and preferences from your
                conversations. These memories help her provide more personalized
                responses.
              </p>
            </section>
          )}

          {/* ── Keyboard Shortcuts ──────────────────────────────────── */}
          {visibleSections.some((s) => s.id === "shortcuts") && (
            <section
              id="settings-shortcuts"
              ref={(el) => { sectionRefs.current["shortcuts"] = el; }}
              className="settings-section"
            >
              <SectionHeader icon={Keyboard} label="Keyboard Shortcuts" color="blue" />

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

              <p className="settings-desc">
                Shortcuts are disabled while typing in input fields or during AI
                streaming. On macOS, use <Command size={10} className="inline" />{" "}
                Cmd; on Windows/Linux, use Ctrl.
              </p>
            </section>
          )}

        </div>
      </div>
    </div>
  );
}
