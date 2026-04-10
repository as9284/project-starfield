import { useState, useEffect, useRef } from "react";
import {
  Download,
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
  Music,
  Film,
  Sparkles,
  FolderOpen,
  X,
  List,
  RotateCcw,
  Loader2,
  Package,
  Clock,
  Zap,
  ChevronDown,
  ChevronUp,
  Pause,
  Play,
  Trash2,
  Check,
} from "lucide-react";
import StarField from "../components/StarField";
import { useAppStore } from "../store/useAppStore";
import { usePulsarStore } from "../store/usePulsarStore";
import type {
  FormatOption,
  AudioFormat,
  DownloadItem,
} from "../store/usePulsarStore";
import {
  pulsarCheckYtdlp,
  pulsarDownload,
  pulsarGetDownloadsDir,
  pulsarCancelDownload,
  pulsarInstallYtdlp,
  pulsarDeleteFile,
} from "../lib/tauri";
import { open } from "@tauri-apps/plugin-dialog";

interface FormatChoice {
  id: FormatOption;
  label: string;
  description: string;
  icon: typeof Download;
}

const FORMAT_OPTIONS: FormatChoice[] = [
  {
    id: "best",
    label: "Best quality",
    description: "Highest available video + audio",
    icon: Sparkles,
  },
  { id: "1080", label: "1080p", description: "Full HD video", icon: Film },
  {
    id: "720",
    label: "720p",
    description: "HD video, smaller file",
    icon: Film,
  },
  {
    id: "audio",
    label: "Audio only",
    description: "Extract audio",
    icon: Music,
  },
];

interface AudioFormatChoice {
  id: AudioFormat;
  label: string;
}

const AUDIO_FORMAT_OPTIONS: AudioFormatChoice[] = [
  { id: "mp3", label: "MP3" },
  { id: "flac", label: "FLAC" },
  { id: "wav", label: "WAV" },
  { id: "ogg", label: "OGG" },
  { id: "m4a", label: "M4A" },
  { id: "opus", label: "Opus" },
];

function formatBytes(str: string) {
  return str;
}

function ProgressBar({ percent }: { percent: number }) {
  return (
    <div
      className="w-full rounded-full overflow-hidden"
      style={{
        height: 4,
        background: "rgba(37, 34, 96, 0.6)",
      }}
    >
      <div
        className="h-full rounded-full transition-all duration-300"
        style={{
          width: `${Math.min(100, Math.max(0, percent))}%`,
          background:
            "linear-gradient(90deg, var(--color-purple-400), #a78bfa)",
        }}
      />
    </div>
  );
}

function statusColor(status: DownloadItem["status"]): string {
  switch (status) {
    case "done":
      return "#86efac";
    case "error":
    case "cancelled":
      return "#fca5a5";
    case "paused":
      return "#fcd34d";
    case "downloading":
    case "merging":
    case "queued":
      return "var(--color-purple-400)";
  }
}

function statusLabel(item: DownloadItem): string {
  switch (item.status) {
    case "queued":
      return "Queued";
    case "downloading":
      if (item.playlistTotal != null && item.playlistIndex != null) {
        return `Item ${item.playlistIndex} of ${item.playlistTotal}`;
      }
      return item.progress > 0 ? `${item.progress.toFixed(1)}%` : "Starting…";
    case "merging":
      return "Merging…";
    case "paused":
      return item.progress > 0
        ? `Paused at ${item.progress.toFixed(1)}%`
        : "Paused";
    case "done":
      return "Complete";
    case "error":
      return item.error ? "Error" : "Failed";
    case "cancelled":
      return "Cancelled";
  }
}

function DownloadCard({
  item,
  onCancel,
  onPause,
  onResume,
  onRemove,
  onRetry,
}: {
  item: DownloadItem;
  onCancel: (id: string) => void;
  onPause: (id: string) => void;
  onResume: (item: DownloadItem) => void;
  onRemove: (id: string) => void;
  onRetry: (item: DownloadItem) => void;
}) {
  const isActive =
    item.status === "downloading" ||
    item.status === "queued" ||
    item.status === "merging";

  const displayName = item.filename
    ? (item.filename.split("/").pop() ?? item.filename)
    : item.url.length > 60
      ? item.url.slice(0, 60) + "…"
      : item.url;
  const [confirmRemove, setConfirmRemove] = useState(false);

  return (
    <div
      className="glass rounded-xl px-4 py-3 flex flex-col gap-2"
      style={{
        borderColor: isActive
          ? "rgba(124, 79, 240, 0.3)"
          : item.status === "done"
            ? "rgba(34,197,94,0.2)"
            : item.status === "paused"
              ? "rgba(252,211,77,0.25)"
              : "rgba(239,68,68,0.2)",
      }}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p
            className="text-xs font-medium truncate"
            style={{ color: "var(--color-text-primary)" }}
            title={displayName}
          >
            {displayName}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <span
              className="text-xs"
              style={{ color: statusColor(item.status) }}
            >
              {statusLabel(item)}
            </span>
            {item.status === "downloading" &&
              item.speed &&
              item.speed !== "?" && (
                <>
                  <span style={{ color: "var(--color-text-secondary)" }}>
                    ·
                  </span>
                  <span
                    className="text-xs flex items-center gap-1"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    <Zap size={10} />
                    {formatBytes(item.speed)}
                  </span>
                </>
              )}
            {item.status === "downloading" && item.eta && (
              <>
                <span style={{ color: "var(--color-text-secondary)" }}>·</span>
                <span
                  className="text-xs flex items-center gap-1"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  <Clock size={10} />
                  {item.eta}
                </span>
              </>
            )}
          </div>
          {item.status === "error" && item.error && (
            <p
              className="text-xs mt-1 line-clamp-2"
              style={{ color: "#fca5a5" }}
            >
              {item.error}
            </p>
          )}
          {item.status === "done" && item.filePath && (
            <p
              className="text-xs mt-0.5 truncate"
              style={{ color: "var(--color-text-secondary)" }}
              title={item.filePath}
            >
              {item.filePath.split("/").pop() ?? item.filePath}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {item.status === "downloading" && (
            <button
              className="win-btn"
              title="Pause download"
              onClick={() => onPause(item.id)}
            >
              <Pause size={12} />
            </button>
          )}
          {isActive && (
            <button
              className="win-btn"
              title="Cancel download"
              onClick={() => onCancel(item.id)}
            >
              <X size={12} />
            </button>
          )}
          {item.status === "paused" && (
            <button
              className="win-btn"
              title="Resume download"
              onClick={() => onResume(item)}
            >
              <Play size={12} />
            </button>
          )}
          {(item.status === "error" || item.status === "cancelled") && (
            <button
              className="win-btn"
              title="Retry"
              onClick={() => onRetry(item)}
            >
              <RotateCcw size={12} />
            </button>
          )}
          {!isActive &&
            (confirmRemove ? (
              <div className="flex items-center gap-1">
                <button
                  className="win-btn"
                  title="Confirm remove"
                  onClick={() => onRemove(item.id)}
                  style={{ color: "rgba(248, 113, 113, 0.9)" }}
                >
                  <Check size={12} />
                </button>
                <button
                  className="win-btn"
                  title="Cancel"
                  onClick={() => setConfirmRemove(false)}
                >
                  <X size={12} />
                </button>
              </div>
            ) : (
              <button
                className="win-btn"
                title="Remove"
                onClick={() => setConfirmRemove(true)}
              >
                <Trash2 size={12} />
              </button>
            ))}
        </div>
      </div>

      {(item.status === "downloading" || item.status === "merging") && (
        <ProgressBar
          percent={item.status === "merging" ? 100 : item.progress}
        />
      )}
      {item.status === "paused" && item.progress > 0 && (
        <ProgressBar percent={item.progress} />
      )}
    </div>
  );
}

export default function Pulsar() {
  const { goBack } = useAppStore();
  const {
    downloads,
    outputDir,
    setOutputDir,
    addDownload,
    updateDownload,
    removeDownload,
    clearCompleted,
  } = usePulsarStore();

  const [hasYtdlp, setHasYtdlp] = useState<boolean | null>(null);
  const [installing, setInstalling] = useState(false);
  const [installFailed, setInstallFailed] = useState(false);
  const [url, setUrl] = useState("");
  const [format, setFormat] = useState<FormatOption>("best");
  const [audioFormat, setAudioFormat] = useState<AudioFormat>("mp3");
  const [playlist, setPlaylist] = useState(false);
  const [showHistory, setShowHistory] = useState(true);

  const activeDownloads = downloads.filter(
    (d) =>
      d.status === "downloading" ||
      d.status === "queued" ||
      d.status === "merging",
  );
  const pausedDownloads = downloads.filter((d) => d.status === "paused");
  const historyDownloads = downloads.filter(
    (d) =>
      d.status === "done" || d.status === "error" || d.status === "cancelled",
  );

  // Refs so callbacks always see latest state
  const updateDownloadRef = useRef(updateDownload);
  updateDownloadRef.current = updateDownload;

  // Track IDs that were paused so we don't overwrite their status with "cancelled"
  const pausedIdsRef = useRef(new Set<string>());

  // Check for yt-dlp once on mount, but do not auto-install on page load.
  useEffect(() => {
    let cancelled = false;

    pulsarCheckYtdlp()
      .then((found) => {
        if (cancelled) return;
        setHasYtdlp(found);
        setInstallFailed(false);
      })
      .catch(() => {
        if (cancelled) return;
        setHasYtdlp(false);
        setInstallFailed(false);
      });

    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Populate default output dir if not already set
  useEffect(() => {
    if (!outputDir) {
      pulsarGetDownloadsDir()
        .then(setOutputDir)
        .catch(() => {});
    }
  }, [outputDir, setOutputDir]);

  const handleInstallYtdlp = async () => {
    setInstalling(true);
    setInstallFailed(false);
    try {
      const ok = await pulsarInstallYtdlp();
      if (ok) {
        setHasYtdlp(true);
      } else {
        setInstallFailed(true);
      }
    } catch {
      setInstallFailed(true);
    } finally {
      setInstalling(false);
    }
  };

  const handlePickDir = async () => {
    try {
      const result = await open({ directory: true, multiple: false });
      if (typeof result === "string" && result) {
        setOutputDir(result);
      }
    } catch {
      // user cancelled
    }
  };

  const startDownload = async (
    downloadUrl: string,
    downloadFormat: FormatOption,
    isPlaylist: boolean,
    audioFmt: AudioFormat = "mp3",
    existingId?: string,
  ) => {
    if (!outputDir.trim()) return;

    // Prevent duplicate downloads — skip if the same URL is already active or paused
    if (!existingId) {
      const isDuplicate = downloads.some(
        (d) =>
          d.url === downloadUrl &&
          (d.status === "downloading" ||
            d.status === "queued" ||
            d.status === "merging" ||
            d.status === "paused"),
      );
      if (isDuplicate) return;
    }

    const id = existingId ?? crypto.randomUUID();
    if (existingId) {
      updateDownload(id, {
        status: "queued",
        progress: 0,
        speed: "",
        eta: "",
        error: undefined,
      });
    } else {
      const item: DownloadItem = {
        id,
        url: downloadUrl,
        format: downloadFormat,
        audioFormat: downloadFormat === "audio" ? audioFmt : undefined,
        playlist: isPlaylist,
        status: "queued",
        progress: 0,
        speed: "",
        eta: "",
        createdAt: Date.now(),
      };
      addDownload(item);
    }

    try {
      await pulsarDownload(
        id,
        downloadUrl,
        downloadFormat,
        audioFmt,
        outputDir,
        isPlaylist,
        (event) => {
          switch (event.type) {
            case "progress":
              updateDownloadRef.current(id, {
                status: "downloading",
                progress: event.percent,
                speed: event.speed,
                eta: event.eta,
              });
              break;
            case "playlistItem":
              updateDownloadRef.current(id, {
                status: "downloading",
                playlistIndex: event.index,
                playlistTotal: event.total,
                progress: 0,
              });
              break;
            case "merging":
              updateDownloadRef.current(id, {
                status: "merging",
                progress: 100,
              });
              break;
            case "done":
              updateDownloadRef.current(id, {
                status: "done",
                progress: 100,
                speed: "",
                eta: "",
                filePath: event.file_path ?? undefined,
                filename: event.file_path ?? undefined,
              });
              break;
            case "error":
              // Don't overwrite paused status
              if (pausedIdsRef.current.has(id)) {
                pausedIdsRef.current.delete(id);
                updateDownloadRef.current(id, { speed: "", eta: "" });
                break;
              }
              updateDownloadRef.current(id, {
                status:
                  event.message === "Download cancelled"
                    ? "cancelled"
                    : "error",
                error: event.message,
                speed: "",
                eta: "",
              });
              break;
          }
        },
      );
    } catch (e) {
      // Don't overwrite paused status on catch either
      if (!pausedIdsRef.current.has(id)) {
        updateDownload(id, {
          status: "error",
          error: String(e),
        });
      } else {
        pausedIdsRef.current.delete(id);
      }
    }
  };

  const handleDownload = async () => {
    const trimmed = url.trim();
    if (!trimmed || hasYtdlp === false) return;
    if (!outputDir.trim()) return;

    setUrl("");
    await startDownload(trimmed, format, playlist, audioFormat);
  };

  const handleCancel = async (id: string) => {
    const dl = downloads.find((d) => d.id === id);
    try {
      await pulsarCancelDownload(id);
    } catch {
      // ignore
    }
    // Delete partial file from disk
    if (dl?.filePath) {
      try {
        await pulsarDeleteFile(dl.filePath);
      } catch {
        // ignore
      }
    }
  };

  const handlePause = async (id: string) => {
    pausedIdsRef.current.add(id);
    updateDownload(id, { status: "paused" });
    try {
      await pulsarCancelDownload(id);
    } catch {
      // ignore
    }
  };

  const handleResume = (item: DownloadItem) => {
    void startDownload(
      item.url,
      item.format,
      item.playlist,
      item.audioFormat ?? "mp3",
      item.id,
    );
  };

  const handleRemove = async (id: string) => {
    const dl = downloads.find((d) => d.id === id);
    // Delete the file from disk if it exists
    if (dl?.filePath) {
      try {
        await pulsarDeleteFile(dl.filePath);
      } catch {
        // ignore
      }
    }
    removeDownload(id);
  };

  const handleRetry = (item: DownloadItem) => {
    void startDownload(
      item.url,
      item.format,
      item.playlist,
      item.audioFormat ?? "mp3",
    );
  };

  const noOutputDir = !outputDir.trim();

  return (
    <div className="flex-1 flex flex-col min-h-0 relative overflow-hidden">
      <StarField />

      <div className="above-stars flex-1 flex flex-col min-h-0">
        {/* Header */}
        <div
          className="flex items-center gap-3 px-5 py-3"
          style={{ borderBottom: "1px solid var(--color-border-dim)" }}
        >
          <button className="win-btn" onClick={goBack} title="Back (Esc)">
            <ArrowLeft size={14} />
          </button>
          <Download size={16} style={{ color: "var(--color-purple-400)" }} />
          <span
            className="text-sm font-semibold"
            style={{ color: "var(--color-text-primary)" }}
          >
            Pulsar
          </span>
          <span
            className="text-xs px-2 py-0.5 rounded"
            style={{
              background: "rgba(124, 79, 240, 0.12)",
              color: "var(--color-purple-300)",
            }}
          >
            constellation
          </span>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="flex flex-col px-6 py-8 gap-6 max-w-xl mx-auto w-full">
            {/* Title */}
            <div className="text-center">
              <div className="flex items-center justify-center gap-2.5 mb-2">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{
                    background: "rgba(124, 79, 240, 0.15)",
                    border: "1px solid rgba(124, 79, 240, 0.25)",
                  }}
                >
                  <Download
                    size={20}
                    style={{ color: "var(--color-purple-400)" }}
                  />
                </div>
              </div>
              <h2
                className="text-xl font-bold"
                style={{ color: "var(--color-text-primary)" }}
              >
                Pulsar
              </h2>
              <p
                className="text-sm mt-1"
                style={{ color: "var(--color-text-muted)" }}
              >
                Grab videos and music with a single pulse.
              </p>
            </div>

            {/* yt-dlp not found / auto-installing */}
            {(hasYtdlp === false || installing) && (
              <div
                className="glass rounded-xl px-5 py-4 w-full flex flex-col gap-3"
                style={{
                  borderColor: installing
                    ? "rgba(124, 79, 240, 0.3)"
                    : installFailed
                      ? "rgba(239, 68, 68, 0.25)"
                      : "rgba(234, 179, 8, 0.25)",
                }}
              >
                <div className="flex items-center gap-2">
                  {installing ? (
                    <Loader2
                      size={15}
                      className="animate-spin"
                      style={{
                        color: "var(--color-purple-400)",
                        flexShrink: 0,
                      }}
                    />
                  ) : (
                    <AlertCircle
                      size={15}
                      style={{
                        color: installFailed ? "#fca5a5" : "#eab308",
                        flexShrink: 0,
                      }}
                    />
                  )}
                  <span
                    className="text-sm font-medium"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    {installing
                      ? "Downloading yt-dlp…"
                      : installFailed
                        ? "Installation failed"
                        : "yt-dlp not found"}
                  </span>
                </div>
                <p
                  className="text-xs"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  {installing ? (
                    "Grabbing the yt-dlp binary for you — won't take long."
                  ) : installFailed ? (
                    <>
                      Automatic installation didn't work. Install{" "}
                      <a
                        href="https://github.com/yt-dlp/yt-dlp#installation"
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          color: "var(--color-nebula-teal)",
                          textDecoration: "underline",
                        }}
                      >
                        yt-dlp
                      </a>{" "}
                      manually via pip, brew, or the link above — then restart
                      the app.
                    </>
                  ) : (
                    <>
                      Pulsar requires{" "}
                      <a
                        href="https://github.com/yt-dlp/yt-dlp#installation"
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          color: "var(--color-nebula-teal)",
                          textDecoration: "underline",
                        }}
                      >
                        yt-dlp
                      </a>
                      . Install it below or from Settings to enable downloads.
                    </>
                  )}
                </p>
                {!installing && (installFailed || hasYtdlp === false) && (
                  <button
                    className="btn-send"
                    style={{
                      position: "static",
                      height: 34,
                      borderRadius: "var(--radius-md)",
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      gap: "0.4rem",
                      width: "fit-content",
                      padding: "0 16px",
                    }}
                    onClick={() => void handleInstallYtdlp()}
                  >
                    <Package size={13} />
                    {installFailed ? "Retry install" : "Install yt-dlp"}
                  </button>
                )}
              </div>
            )}

            {/* URL input + output dir */}
            <div className="w-full flex flex-col gap-2.5">
              <input
                className="settings-input"
                placeholder="Paste a YouTube or video URL…"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleDownload();
                }}
                disabled={hasYtdlp === false}
                spellCheck={false}
              />

              {/* Output directory */}
              <div className="flex items-center gap-2">
                <button
                  className="win-btn shrink-0"
                  title="Pick folder"
                  onClick={() => void handlePickDir()}
                >
                  <FolderOpen size={13} />
                </button>
                <input
                  className="settings-input text-xs flex-1"
                  style={{ fontSize: "0.75rem", padding: "6px 10px" }}
                  placeholder="Output directory (click folder icon to browse)"
                  value={outputDir}
                  onChange={(e) => setOutputDir(e.target.value)}
                />
              </div>

              {noOutputDir && (
                <p className="text-xs" style={{ color: "#fca5a5" }}>
                  Set an output directory before downloading.
                </p>
              )}
            </div>

            {/* Format + Playlist row */}
            <div className="w-full flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span
                  className="text-xs font-semibold uppercase tracking-widest"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  Format
                </span>
                {/* Playlist toggle */}
                <button
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all`}
                  style={{
                    background: playlist
                      ? "rgba(124, 79, 240, 0.15)"
                      : "rgba(16,15,46,0.5)",
                    border: playlist
                      ? "1px solid rgba(124, 79, 240, 0.35)"
                      : "1px solid rgba(37,34,96,0.4)",
                    color: playlist
                      ? "var(--color-purple-400)"
                      : "var(--color-text-muted)",
                    cursor: "pointer",
                  }}
                  onClick={() => setPlaylist((v) => !v)}
                >
                  <List size={12} />
                  Playlist
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {FORMAT_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  const isActive = format === opt.id;
                  return (
                    <button
                      key={opt.id}
                      className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-left transition-all"
                      style={{
                        background: isActive
                          ? "rgba(124, 79, 240, 0.12)"
                          : "rgba(16, 15, 46, 0.5)",
                        border: isActive
                          ? "1px solid rgba(124, 79, 240, 0.35)"
                          : "1px solid rgba(37, 34, 96, 0.4)",
                        cursor: "pointer",
                      }}
                      onClick={() => setFormat(opt.id)}
                    >
                      <Icon
                        size={14}
                        style={{
                          color: isActive
                            ? "var(--color-purple-400)"
                            : "var(--color-text-secondary)",
                          flexShrink: 0,
                        }}
                      />
                      <div>
                        <p
                          className="text-xs font-medium"
                          style={{
                            color: isActive
                              ? "var(--color-text-primary)"
                              : "var(--color-text-secondary)",
                          }}
                        >
                          {opt.label}
                        </p>
                        <p
                          className="text-xs"
                          style={{
                            color: "var(--color-text-muted)",
                            fontSize: "0.75rem",
                          }}
                        >
                          {opt.description}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Audio format selector — visible when audio format is selected */}
              {format === "audio" && (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {AUDIO_FORMAT_OPTIONS.map((af) => {
                    const isActive = audioFormat === af.id;
                    return (
                      <button
                        key={af.id}
                        className="px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
                        style={{
                          background: isActive
                            ? "rgba(124, 79, 240, 0.15)"
                            : "rgba(16,15,46,0.5)",
                          border: isActive
                            ? "1px solid rgba(124, 79, 240, 0.35)"
                            : "1px solid rgba(37,34,96,0.4)",
                          color: isActive
                            ? "var(--color-purple-400)"
                            : "var(--color-text-muted)",
                          cursor: "pointer",
                        }}
                        onClick={() => setAudioFormat(af.id)}
                      >
                        {af.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Download button */}
            <button
              className="btn-send w-full"
              style={{
                position: "static",
                width: "100%",
                height: 44,
                borderRadius: "var(--radius-md)",
                fontSize: "0.9rem",
                fontWeight: 600,
                gap: "0.5rem",
              }}
              onClick={() => void handleDownload()}
              disabled={
                !url.trim() || hasYtdlp !== true || installing || noOutputDir
              }
            >
              <Download size={15} />
              {playlist ? "Download Playlist" : "Download"}
            </button>

            {/* Active downloads */}
            {activeDownloads.length > 0 && (
              <div className="w-full flex flex-col gap-2">
                <span
                  className="text-xs font-semibold uppercase tracking-widest"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  Active ({activeDownloads.length})
                </span>
                {activeDownloads.map((d) => (
                  <DownloadCard
                    key={d.id}
                    item={d}
                    onCancel={handleCancel}
                    onPause={handlePause}
                    onResume={handleResume}
                    onRemove={handleRemove}
                    onRetry={handleRetry}
                  />
                ))}
              </div>
            )}

            {/* Paused downloads */}
            {pausedDownloads.length > 0 && (
              <div className="w-full flex flex-col gap-2">
                <span
                  className="text-xs font-semibold uppercase tracking-widest"
                  style={{ color: "#fcd34d" }}
                >
                  Paused ({pausedDownloads.length})
                </span>
                {pausedDownloads.map((d) => (
                  <DownloadCard
                    key={d.id}
                    item={d}
                    onCancel={handleCancel}
                    onPause={handlePause}
                    onResume={handleResume}
                    onRemove={handleRemove}
                    onRetry={handleRetry}
                  />
                ))}
              </div>
            )}

            {/* History */}
            {historyDownloads.length > 0 && (
              <div className="w-full flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <button
                    className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest"
                    style={{
                      color: "var(--color-text-muted)",
                      cursor: "pointer",
                    }}
                    onClick={() => setShowHistory((v) => !v)}
                  >
                    {showHistory ? (
                      <ChevronUp size={12} />
                    ) : (
                      <ChevronDown size={12} />
                    )}
                    History ({historyDownloads.length})
                  </button>
                  {showHistory && (
                    <button
                      className="text-xs"
                      style={{
                        color: "var(--color-text-secondary)",
                        cursor: "pointer",
                      }}
                      onClick={clearCompleted}
                    >
                      Clear
                    </button>
                  )}
                </div>
                {showHistory &&
                  historyDownloads.map((d) => (
                    <DownloadCard
                      key={d.id}
                      item={d}
                      onCancel={handleCancel}
                      onPause={handlePause}
                      onResume={handleResume}
                      onRemove={handleRemove}
                      onRetry={handleRetry}
                    />
                  ))}
              </div>
            )}

            {/* yt-dlp missing + no downloads yet */}
            {hasYtdlp === null && (
              <div className="flex justify-center">
                <Loader2
                  size={18}
                  className="animate-spin"
                  style={{ color: "var(--color-text-secondary)" }}
                />
              </div>
            )}

            {hasYtdlp === true && downloads.length === 0 && (
              <div
                className="flex flex-col items-center gap-2 py-6"
                style={{ color: "var(--color-text-secondary)" }}
              >
                <CheckCircle2 size={24} style={{ opacity: 0.4 }} />
                <p className="text-xs text-center" style={{ opacity: 0.7 }}>
                  No downloads yet. Paste a URL above to get started.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
