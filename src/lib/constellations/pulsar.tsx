import { Download, ExternalLink } from "lucide-react";
import { usePulsarStore } from "../../store/usePulsarStore";
import type { FormatOption, AudioFormat } from "../../store/usePulsarStore";
import { pulsarDownload, pulsarGetDownloadsDir } from "../tauri";
import type {
  ConstellationHandler,
  ParsedCommand,
  ActionResult,
} from "../constellation-registry";

// ── Result card ──────────────────────────────────────────────────────────────

function DownloadCard({
  result,
  onNavigate,
}: {
  result: ActionResult;
  onNavigate?: (view: string) => void;
}) {
  if (result.type === "download_error") {
    return (
      <div className="luna-action-card luna-action-card-error">
        <Download size={14} style={{ flexShrink: 0 }} />
        <span>Download failed: {result.error as string}</span>
      </div>
    );
  }

  const url = result.url as string;
  const format = result.format as string;
  const formatLabel =
    format === "audio"
      ? "Audio"
      : format === "best"
        ? "Best quality"
        : format + "p";

  return (
    <div className="luna-action-card luna-action-card-pulsar">
      <div className="luna-download-header">
        <Download
          size={13}
          style={{ color: "var(--color-purple-400)", flexShrink: 0 }}
        />
        <span className="luna-download-label">Download queued</span>
        <span className="luna-download-format">{formatLabel}</span>
      </div>
      <div className="luna-download-url">
        {url.length > 56 ? url.slice(0, 56) + "…" : url}
      </div>
      <button
        className="luna-card-btn"
        onClick={() => onNavigate?.("pulsar")}
      >
        <ExternalLink size={12} />
        <span>View in Pulsar</span>
      </button>
    </div>
  );
}

// ── Handler ──────────────────────────────────────────────────────────────────

export const pulsarHandler: ConstellationHandler = {
  tag: "pulsar-commands",
  name: "Pulsar",
  multiCommand: false,

  promptInstructions: `### Pulsar Control — Media Downloads

\`\`\`pulsar-commands
DOWNLOAD_MEDIA {"url":"https://...","format":"best|audio|720|1080","audio_format":"mp3|flac|wav|ogg|m4a|opus"}
\`\`\`

Use this when the user asks to download a video, audio track, or playlist from YouTube or supported sites. The "audio_format" field is only required when format is "audio". Default format is "best". Only one command per block.`,

  buildContext(): string {
    const store = usePulsarStore.getState();
    const active = store.downloads.filter(
      (d) =>
        d.status === "downloading" ||
        d.status === "queued" ||
        d.status === "merging",
    ).length;
    if (active === 0) return "";
    return `## Pulsar — Active Downloads: ${active} in queue`;
  },

  async execute(commands: ParsedCommand[]): Promise<ActionResult[]> {
    const cmd = commands[0];
    if (!cmd || !cmd.args.url) return [];

    const store = usePulsarStore.getState();
    const url = String(cmd.args.url);
    const format = (
      ["best", "audio", "720", "1080"].includes(
        String(cmd.args.format ?? "best"),
      )
        ? cmd.args.format
        : "best"
    ) as FormatOption;
    const audioFormat =
      (cmd.args.audio_format as AudioFormat | undefined) ?? "mp3";
    const downloadId = crypto.randomUUID();

    const item = {
      id: downloadId,
      url,
      format,
      audioFormat: format === "audio" ? audioFormat : undefined,
      playlist: false,
      status: "queued" as const,
      progress: 0,
      speed: "",
      eta: "",
      createdAt: Date.now(),
    };
    store.addDownload(item);

    try {
      const dir =
        store.outputDir || (await pulsarGetDownloadsDir());
      if (!store.outputDir) store.setOutputDir(dir);

      void pulsarDownload(
        downloadId,
        url,
        format,
        format === "audio" ? audioFormat : "mp3",
        dir,
        false,
        (event) => {
          const s = usePulsarStore.getState();
          if (event.type === "progress") {
            s.updateDownload(downloadId, {
              status: "downloading",
              progress: event.percent,
              speed: event.speed,
              eta: event.eta,
            });
          } else if (event.type === "done") {
            s.updateDownload(downloadId, {
              status: "done",
              progress: 100,
              filePath: event.file_path ?? undefined,
              filename: event.file_path ?? undefined,
            });
          } else if (event.type === "error") {
            s.updateDownload(downloadId, {
              status: "error",
              error: event.message,
            });
          } else if (event.type === "merging") {
            s.updateDownload(downloadId, {
              status: "merging",
              progress: 100,
            });
          }
        },
      );

      return [
        {
          type: "download_queued",
          handler: "pulsar-commands",
          url,
          format,
          downloadId,
        },
      ];
    } catch (e) {
      store.updateDownload(downloadId, {
        status: "error",
        error: String(e),
      });
      return [
        {
          type: "download_error",
          handler: "pulsar-commands",
          url,
          error: String(e),
        },
      ];
    }
  },

  ResultCard: DownloadCard,
};
