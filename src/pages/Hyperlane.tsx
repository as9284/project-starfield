import { useState, type FormEvent } from "react";
import {
  Link,
  ArrowLeft,
  ExternalLink,
  Copy,
  Check,
  Trash2,
  Loader2,
  AlertCircle,
} from "lucide-react";
import StarField from "../components/StarField";
import { useAppStore } from "../store/useAppStore";
import { useHyperlaneStore, type HyperlaneEntry } from "../store/useHyperlaneStore";

// ── Helpers ──────────────────────────────────────────────────────────────────

function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return "https://" + trimmed;
}

function isValidUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

async function shortenUrl(url: string): Promise<string> {
  const endpoint = `https://is.gd/create.php?format=json&url=${encodeURIComponent(url)}`;

  let res: Response;
  try {
    res = await fetch(endpoint);
  } catch {
    throw new Error("Network error — check your connection and try again.");
  }

  if (!res.ok) {
    throw new Error(`Service error (${res.status}). Please try again.`);
  }

  const data: unknown = await res.json();

  if (data !== null && typeof data === "object" && "errorcode" in data) {
    const errData = data as { errorcode: number; errormessage?: string };
    switch (errData.errorcode) {
      case 1:
        throw new Error("That URL doesn't look valid. Double-check and try again.");
      case 2:
        throw new Error("Custom alias unavailable. Try a different one.");
      case 3:
        throw new Error("Rate limit reached. Wait a moment and try again.");
      default:
        throw new Error(errData.errormessage ?? "Could not shorten this URL.");
    }
  }

  if (
    data !== null &&
    typeof data === "object" &&
    "shorturl" in data &&
    typeof (data as { shorturl: unknown }).shorturl === "string"
  ) {
    return (data as { shorturl: string }).shorturl;
  }

  throw new Error("Unexpected response from shortener service.");
}

function truncateUrl(url: string, max = 55): string {
  return url.length <= max ? url : url.slice(0, max - 1) + "…";
}

// ── Result Card ──────────────────────────────────────────────────────────────

function ResultCard({
  shortUrl,
  copied,
  onCopy,
}: {
  shortUrl: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="glass rounded-xl p-4 flex items-center gap-3 w-full">
      <a
        href={shortUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex-1 font-mono text-sm truncate transition-colors"
        style={{ color: "var(--color-purple-200)" }}
      >
        {shortUrl}
      </a>

      <div className="flex items-center gap-1.5 shrink-0">
        <a
          href={shortUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="win-btn"
          title="Open link"
        >
          <ExternalLink size={13} />
        </a>

        <button
          onClick={onCopy}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border cursor-pointer"
          style={
            copied
              ? {
                  color: "#86efac",
                  background: "rgba(34,197,94,0.1)",
                  borderColor: "rgba(34,197,94,0.3)",
                }
              : {
                  color: "var(--color-purple-300)",
                  background: "rgba(124,79,240,0.08)",
                  borderColor: "rgba(124,79,240,0.2)",
                }
          }
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

// ── History List ─────────────────────────────────────────────────────────────

function HistoryList({
  entries,
  onCopy,
  onClear,
  copiedId,
}: {
  entries: HyperlaneEntry[];
  onCopy: (text: string, id: string) => void;
  onClear: () => void;
  copiedId: string | null;
}) {
  if (entries.length === 0) return null;

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span
            className="text-xs font-semibold uppercase tracking-widest"
            style={{ color: "var(--color-text-muted)" }}
          >
            Recent
          </span>
          <span
            className="text-xs px-1.5 py-0.5 rounded font-medium"
            style={{
              background: "rgba(124,58,237,0.15)",
              color: "var(--color-purple-400)",
              fontSize: "0.72rem",
            }}
          >
            {entries.length}
          </span>
        </div>
        <button
          onClick={onClear}
          className="luna-tool-btn"
          title="Clear history"
        >
          <Trash2 size={11} />
          <span>Clear</span>
        </button>
      </div>

      <div className="flex flex-col gap-1.5">
        {entries.map((entry) => (
          <div
            key={entry.id}
            className="group flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors"
            style={{
              background: "rgba(16, 15, 46, 0.5)",
              border: "1px solid rgba(37, 34, 96, 0.4)",
            }}
          >
            <div className="flex-1 min-w-0">
              <p
                className="text-xs truncate leading-tight"
                style={{ color: "var(--color-text-secondary)" }}
              >
                {truncateUrl(entry.original)}
              </p>
              <a
                href={entry.short}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-mono transition-colors leading-snug"
                style={{ color: "var(--color-purple-300)" }}
              >
                {entry.short}
              </a>
            </div>

            <button
              onClick={() => onCopy(entry.short, entry.id)}
              className="win-btn shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
              title="Copy short link"
            >
              {copiedId === entry.id ? (
                <Check size={13} style={{ color: "#86efac" }} />
              ) : (
                <Copy size={13} />
              )}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function Hyperlane() {
  const { goBack } = useAppStore();
  const { history, addEntry, clearHistory, findCached } = useHyperlaneStore();

  const [url, setUrl] = useState("");
  const [shortUrl, setShortUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const normalized = normalizeUrl(url);

    if (!isValidUrl(normalized)) {
      setError("Please enter a valid URL (e.g. https://example.com)");
      return;
    }

    // Return cached result instantly
    const cached = findCached(normalized);
    if (cached) {
      setShortUrl(cached);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    setShortUrl(null);

    try {
      const short = await shortenUrl(normalized);
      setShortUrl(short);
      addEntry({
        id: crypto.randomUUID(),
        original: normalized,
        short,
        createdAt: Date.now(),
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!shortUrl) return;
    try {
      await navigator.clipboard.writeText(shortUrl);
    } catch {
      // clipboard API may not be available
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyHistoryEntry = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // clipboard API may not be available
    }
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleUrlChange = (value: string) => {
    setUrl(value);
    if (error) setError(null);
    if (shortUrl) setShortUrl(null);
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
          <button
            className="win-btn"
            onClick={goBack}
            title="Back (Esc)"
          >
            <ArrowLeft size={14} />
          </button>
          <Link size={16} style={{ color: "var(--color-nebula-teal)" }} />
          <span
            className="text-sm font-semibold"
            style={{ color: "var(--color-text-primary)" }}
          >
            Hyperlane
          </span>
          <span
            className="text-xs px-2 py-0.5 rounded"
            style={{
              background: "rgba(20, 184, 166, 0.12)",
              color: "var(--color-nebula-teal)",
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
                    background: "rgba(20, 184, 166, 0.15)",
                    border: "1px solid rgba(20, 184, 166, 0.25)",
                  }}
                >
                  <Link size={20} style={{ color: "var(--color-nebula-teal)" }} />
                </div>
              </div>
              <h2
                className="text-xl font-bold"
                style={{ color: "var(--color-text-primary)" }}
              >
                Hyperlane
              </h2>
              <p
                className="text-sm mt-1"
                style={{ color: "var(--color-text-muted)" }}
              >
                Shorten the distance between you and anywhere.
              </p>
            </div>

            {/* Form */}
            <form
              onSubmit={(e) => void handleSubmit(e)}
              className="w-full"
              noValidate
            >
              <div className="flex gap-2.5 flex-col sm:flex-row">
                <input
                  type="url"
                  value={url}
                  onChange={(e) => handleUrlChange(e.target.value)}
                  placeholder="Paste a long URL…"
                  className="settings-input flex-1"
                  autoComplete="url"
                  spellCheck={false}
                />
                <button
                  type="submit"
                  disabled={loading || !url.trim()}
                  className="btn-send"
                  style={{
                    position: "static",
                    width: "auto",
                    height: 42,
                    borderRadius: "var(--radius-md)",
                    padding: "0 1.25rem",
                    gap: "0.5rem",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                  }}
                >
                  {loading ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    "Shorten"
                  )}
                </button>
              </div>

              {error && (
                <div
                  className="flex items-center gap-2 text-sm mt-3 px-3 py-2 rounded-lg"
                  style={{
                    background: "rgba(239,68,68,0.1)",
                    border: "1px solid rgba(239,68,68,0.25)",
                    color: "#fca5a5",
                  }}
                >
                  <AlertCircle size={13} className="shrink-0" />
                  <span className="text-xs">{error}</span>
                </div>
              )}
            </form>

            {/* Result */}
            {shortUrl && (
              <ResultCard
                shortUrl={shortUrl}
                copied={copied}
                onCopy={() => void handleCopy()}
              />
            )}

            {/* History */}
            <HistoryList
              entries={history}
              onCopy={(text, id) => void handleCopyHistoryEntry(text, id)}
              onClear={clearHistory}
              copiedId={copiedId}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
