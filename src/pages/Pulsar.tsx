import { useState, useEffect } from "react";
import {
  Download,
  ArrowLeft,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Music,
  Film,
  Sparkles,
  FolderOpen,
} from "lucide-react";
import StarField from "../components/StarField";
import { useAppStore } from "../store/useAppStore";
import {
  pulsarCheckYtdlp,
  pulsarDownload,
  pulsarGetDownloadsDir,
} from "../lib/tauri";

type FormatOption = "best" | "audio" | "720" | "1080";

interface FormatChoice {
  id: FormatOption;
  label: string;
  description: string;
  icon: typeof Download;
}

const FORMAT_OPTIONS: FormatChoice[] = [
  { id: "best", label: "Best quality", description: "Highest available video + audio", icon: Sparkles },
  { id: "1080", label: "1080p", description: "Full HD video", icon: Film },
  { id: "720", label: "720p", description: "HD video, smaller file", icon: Film },
  { id: "audio", label: "Audio only", description: "Extract as MP3", icon: Music },
];

export default function Pulsar() {
  const { goBack } = useAppStore();

  const [hasYtdlp, setHasYtdlp] = useState<boolean | null>(null);
  const [url, setUrl] = useState("");
  const [format, setFormat] = useState<FormatOption>("best");
  const [outputDir, setOutputDir] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Check for yt-dlp on mount
  useEffect(() => {
    pulsarCheckYtdlp()
      .then(setHasYtdlp)
      .catch(() => setHasYtdlp(false));

    pulsarGetDownloadsDir()
      .then(setOutputDir)
      .catch(() => {
        // ignore — user can set manually
      });
  }, []);

  const handleDownload = async () => {
    if (!url.trim() || downloading) return;

    setDownloading(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await pulsarDownload(url.trim(), format, outputDir);
      if (result.success) {
        setSuccess(
          result.file_path
            ? `Downloaded to ${result.file_path}`
            : result.message,
        );
        setUrl("");
      } else {
        setError(result.message);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 relative overflow-hidden">
      <StarField />

      <div className="above-stars flex-1 flex flex-col min-h-0">
        {/* Header */}
        <div
          className="flex items-center gap-3 px-5 py-3"
          style={{ borderBottom: "1px solid var(--color-border-dim)" }}
        >
          <button className="win-btn" onClick={goBack} title="Back">
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
              color: "var(--color-text-muted)",
            }}
          >
            constellation
          </span>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="flex flex-col items-center px-6 py-10 gap-8 max-w-xl mx-auto w-full">
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

            {/* yt-dlp not found warning */}
            {hasYtdlp === false && (
              <div
                className="glass rounded-xl px-5 py-4 w-full flex flex-col gap-2"
                style={{ borderColor: "rgba(234, 179, 8, 0.25)" }}
              >
                <div className="flex items-center gap-2">
                  <AlertCircle
                    size={15}
                    style={{ color: "#eab308", flexShrink: 0 }}
                  />
                  <span
                    className="text-sm font-medium"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    yt-dlp not found
                  </span>
                </div>
                <p
                  className="text-xs"
                  style={{ color: "var(--color-text-muted)" }}
                >
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
                  </a>{" "}
                  to be installed on your system. Install it and restart
                  Starfield.
                </p>
              </div>
            )}

            {/* URL input */}
            <div className="w-full flex flex-col gap-3">
              <input
                className="settings-input"
                placeholder="Paste a YouTube or video URL…"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  if (error) setError(null);
                  if (success) setSuccess(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleDownload();
                }}
                disabled={downloading || hasYtdlp === false}
                spellCheck={false}
              />

              {/* Output directory */}
              <div className="flex items-center gap-2">
                <FolderOpen
                  size={13}
                  style={{ color: "var(--color-text-dim)", flexShrink: 0 }}
                />
                <input
                  className="settings-input text-xs"
                  style={{ fontSize: "0.75rem", padding: "6px 10px" }}
                  placeholder="Output directory"
                  value={outputDir}
                  onChange={(e) => setOutputDir(e.target.value)}
                  disabled={downloading}
                />
              </div>
            </div>

            {/* Format selection */}
            <div className="w-full">
              <span
                className="text-xs font-semibold uppercase tracking-widest block mb-2.5"
                style={{ color: "var(--color-text-muted)" }}
              >
                Format
              </span>
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
                            : "var(--color-text-dim)",
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
                            color: "var(--color-text-dim)",
                            fontSize: "0.68rem",
                          }}
                        >
                          {opt.description}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
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
              disabled={!url.trim() || downloading || hasYtdlp === false}
            >
              {downloading ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  Downloading…
                </>
              ) : (
                <>
                  <Download size={15} />
                  Download
                </>
              )}
            </button>

            {/* Error */}
            {error && (
              <div
                className="flex items-start gap-2 text-sm px-4 py-3 rounded-lg w-full"
                style={{
                  background: "rgba(239,68,68,0.1)",
                  border: "1px solid rgba(239,68,68,0.25)",
                  color: "#fca5a5",
                }}
              >
                <AlertCircle
                  size={14}
                  className="shrink-0"
                  style={{ marginTop: 2 }}
                />
                <span className="text-xs">{error}</span>
              </div>
            )}

            {/* Success */}
            {success && (
              <div
                className="flex items-start gap-2 text-sm px-4 py-3 rounded-lg w-full"
                style={{
                  background: "rgba(34,197,94,0.08)",
                  border: "1px solid rgba(34,197,94,0.25)",
                  color: "#86efac",
                }}
              >
                <CheckCircle2
                  size={14}
                  className="shrink-0"
                  style={{ marginTop: 2 }}
                />
                <span className="text-xs">{success}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
