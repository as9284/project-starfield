import { useState } from "react";
import { Link, Copy, Check, ExternalLink, ArrowRight } from "lucide-react";
import { useHyperlaneStore } from "../../store/useHyperlaneStore";
import type {
  ConstellationHandler,
  ParsedCommand,
  ActionResult,
} from "../constellation-registry";

// ── URL shortening ───────────────────────────────────────────────────────────

async function shortenUrl(url: string): Promise<string> {
  const res = await fetch(
    `https://is.gd/create.php?format=json&url=${encodeURIComponent(url)}`,
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as {
    shorturl?: string;
    errorcode?: number;
    errormessage?: string;
  };
  if (data.errorcode)
    throw new Error(data.errormessage ?? "Could not shorten URL");
  if (!data.shorturl) throw new Error("No short URL returned");
  return data.shorturl;
}

// ── Result card ──────────────────────────────────────────────────────────────

function ShortUrlCard({ result }: { result: ActionResult }) {
  const [copied, setCopied] = useState(false);

  if (result.type === "short_url_error") {
    return (
      <div className="luna-action-card luna-action-card-error">
        <Link size={14} style={{ flexShrink: 0 }} />
        <span>
          Could not shorten URL: {result.error as string}
        </span>
      </div>
    );
  }

  const original = result.original as string;
  const short = result.short as string;

  const handleCopy = () => {
    void navigator.clipboard.writeText(short).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="luna-action-card luna-action-card-hyperlane">
      <div className="luna-shorturl-header">
        <Link
          size={13}
          style={{ color: "var(--color-nebula-teal)", flexShrink: 0 }}
        />
        <span className="luna-shorturl-label">Shortened URL</span>
      </div>
      <div className="luna-shorturl-body">
        <span className="luna-shorturl-original">
          {original.length > 50 ? original.slice(0, 50) + "…" : original}
        </span>
        <ArrowRight
          size={12}
          style={{ color: "var(--color-text-secondary)", flexShrink: 0 }}
        />
        <a
          href={short}
          target="_blank"
          rel="noreferrer"
          className="luna-shorturl-short"
        >
          {short}
        </a>
      </div>
      <div className="luna-shorturl-actions">
        <button className="luna-card-btn" onClick={handleCopy}>
          {copied ? <Check size={12} /> : <Copy size={12} />}
          <span>{copied ? "Copied!" : "Copy"}</span>
        </button>
        <a
          href={short}
          target="_blank"
          rel="noreferrer"
          className="luna-card-btn"
        >
          <ExternalLink size={12} />
          <span>Open</span>
        </a>
      </div>
    </div>
  );
}

// ── Handler ──────────────────────────────────────────────────────────────────

export const hyperlaneHandler: ConstellationHandler = {
  tag: "hyperlane-commands",
  name: "Hyperlane",
  multiCommand: false,

  promptInstructions: `### Hyperlane Control — URL Shortening

\`\`\`hyperlane-commands
SHORTEN_URL {"url":"https://..."}
\`\`\`

Use this when the user asks to shorten, compress, or create a short link for a URL. Only one command per block.`,

  buildContext(): string {
    const count = useHyperlaneStore.getState().history.length;
    if (count === 0) return "";
    return `## Hyperlane — ${count} shortened URL${count === 1 ? "" : "s"} in history`;
  },

  async execute(commands: ParsedCommand[]): Promise<ActionResult[]> {
    const cmd = commands[0];
    if (!cmd || !cmd.args.url) return [];

    const originalUrl = String(cmd.args.url);
    const store = useHyperlaneStore.getState();
    const cached = store.findCached(originalUrl);

    try {
      const shortUrl = cached ?? (await shortenUrl(originalUrl));
      if (!cached) {
        store.addEntry({
          id: crypto.randomUUID(),
          original: originalUrl,
          short: shortUrl,
          createdAt: Date.now(),
        });
      }
      return [
        {
          type: "short_url",
          handler: "hyperlane-commands",
          original: originalUrl,
          short: shortUrl,
        },
      ];
    } catch (e) {
      return [
        {
          type: "short_url_error",
          handler: "hyperlane-commands",
          url: originalUrl,
          error: String(e),
        },
      ];
    }
  },

  ResultCard: ShortUrlCard,
};
