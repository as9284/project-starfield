import { Music, Play, Radio, Search } from "lucide-react";
import { useAppStore, type AppView } from "../../store/useAppStore";
import { useLyraStore, type LyraTrack } from "../../store/useLyraStore";
import {
  getConstellation,
  type ConstellationId,
} from "../constellation-catalog";
import { prefetchPage } from "../../App";
import type {
  ConstellationHandler,
  ParsedCommand,
  ActionResult,
} from "../constellation-registry";
import { lyraSearch, lyraGetStreamUrl, lyraCheckAudioCache, lyraCacheAudio } from "../tauri";

// ── Result cards ─────────────────────────────────────────────────────────────

function PlayCard({
  result,
}: {
  result: ActionResult;
  onNavigate?: (view: string) => void;
}) {
  const title = result.title as string;
  const mode = result.mode as string;
  const channel = result.channel as string;

  const handleGo = () => {
    prefetchPage("lyra" as AppView);
    const entry = getConstellation("lyra" as ConstellationId);
    useAppStore
      .getState()
      .startWormhole("lyra" as ConstellationId, entry?.glowHex ?? "#ec4899");
  };

  return (
    <div className="luna-action-card" style={{ borderColor: "rgba(236, 72, 153, 0.3)" }}>
      <div className="flex items-center gap-2 mb-1">
        <span
          className="inline-flex items-center justify-center rounded-full"
          style={{
            width: 22,
            height: 22,
            background: "rgba(236, 72, 153, 0.18)",
            color: "#ec4899",
          }}
        >
          {mode === "video" ? <Play size={11} /> : <Music size={11} />}
        </span>
        <span style={{ color: "var(--color-text-primary)", fontWeight: 560, fontSize: 13 }}>
          Now playing ({mode})
        </span>
      </div>
      <p style={{ color: "var(--color-text-secondary)", fontSize: 12, margin: "4px 0 2px" }}>
        {title}
      </p>
      {channel && (
        <p style={{ color: "var(--color-text-tertiary)", fontSize: 11 }}>{channel}</p>
      )}
      <button
        className="luna-navigate-go"
        style={{ marginTop: 8 }}
        onClick={handleGo}
      >
        View in Lyra <Radio size={11} />
      </button>
    </div>
  );
}

function SearchCard({ result }: { result: ActionResult }) {
  const query = result.query as string;
  const count = result.count as number;

  const handleGo = () => {
    prefetchPage("lyra" as AppView);
    const entry = getConstellation("lyra" as ConstellationId);
    useAppStore
      .getState()
      .startWormhole("lyra" as ConstellationId, entry?.glowHex ?? "#ec4899");
  };

  return (
    <div className="luna-action-card" style={{ borderColor: "rgba(236, 72, 153, 0.3)" }}>
      <div className="flex items-center gap-2 mb-1">
        <span
          className="inline-flex items-center justify-center rounded-full"
          style={{
            width: 22,
            height: 22,
            background: "rgba(236, 72, 153, 0.18)",
            color: "#ec4899",
          }}
        >
          <Search size={11} />
        </span>
        <span style={{ color: "var(--color-text-primary)", fontWeight: 560, fontSize: 13 }}>
          Found {count} result{count !== 1 ? "s" : ""}
        </span>
      </div>
      <p style={{ color: "var(--color-text-secondary)", fontSize: 12, margin: "4px 0 0" }}>
        &ldquo;{query}&rdquo;
      </p>
      <button
        className="luna-navigate-go"
        style={{ marginTop: 8 }}
        onClick={handleGo}
      >
        View in Lyra <Radio size={11} />
      </button>
    </div>
  );
}

function LyraResultCard({
  result,
  onNavigate,
}: {
  result: ActionResult;
  onNavigate?: (view: string) => void;
}) {
  if (result.type === "lyra_playing") return <PlayCard result={result} onNavigate={onNavigate} />;
  if (result.type === "lyra_searched") return <SearchCard result={result} />;
  return null;
}

// ── Handler ──────────────────────────────────────────────────────────────────

export const lyraHandler: ConstellationHandler = {
  tag: "lyra-commands",
  name: "Lyra",
  multiCommand: false,

  promptInstructions: `### Lyra Control — Music & Video Streaming

\`\`\`lyra-commands
PLAY {"query":"search terms","mode":"music|video"}
SEARCH {"query":"search terms"}
\`\`\`

- PLAY: Searches YouTube, picks the best match, and starts streaming it in Lyra. "mode" defaults to "music" if omitted.
- SEARCH: Searches YouTube and shows results in Lyra without auto-playing.
- Music mode caches audio permanently for offline playback; video mode uses temporary caching.
- Only one command per block.`,

  buildContext(): string {
    const { currentTrack, isPlaying, playbackMode, queue } = useLyraStore.getState();
    const parts: string[] = [];

    if (currentTrack) {
      parts.push(
        `Now ${isPlaying ? "playing" : "paused"} (${playbackMode}): "${currentTrack.title}" by ${currentTrack.channel}`,
      );
    }
    if (queue.length > 0) {
      parts.push(`Queue: ${queue.length} track${queue.length !== 1 ? "s" : ""}`);
    }

    return parts.length > 0 ? `Lyra state: ${parts.join(". ")}` : "";
  },

  async execute(commands: ParsedCommand[]): Promise<ActionResult[]> {
    const cmd = commands[0];
    if (!cmd) return [];

    if (cmd.command === "SEARCH") {
      const query = String(cmd.args.query ?? "").trim();
      if (!query) return [];

      try {
        const results = await lyraSearch(query, 12);
        const tracks: LyraTrack[] = results.map((r) => ({
          id: r.id,
          title: r.title,
          channel: r.channel,
          duration: r.duration,
          thumbnail: r.thumbnail,
          viewCount: r.view_count,
        }));

        useLyraStore.getState().setSearchResults(tracks);
        useLyraStore.getState().setSearchQuery(query);

        // Navigate to Lyra
        prefetchPage("lyra" as AppView);
        const entry = getConstellation("lyra" as ConstellationId);
        useAppStore
          .getState()
          .startWormhole("lyra" as ConstellationId, entry?.glowHex ?? "#ec4899");

        return [
          {
            type: "lyra_searched",
            handler: "lyra-commands",
            query,
            count: tracks.length,
          },
        ];
      } catch {
        return [];
      }
    }

    if (cmd.command === "PLAY") {
      const query = String(cmd.args.query ?? "").trim();
      const mode = (String(cmd.args.mode ?? "music").toLowerCase() as "music" | "video");
      if (!query) return [];

      try {
        const results = await lyraSearch(query, 1);
        if (results.length === 0) return [];

        const r = results[0];
        const track: LyraTrack = {
          id: r.id,
          title: r.title,
          channel: r.channel,
          duration: r.duration,
          thumbnail: r.thumbnail,
          viewCount: r.view_count,
        };

        const store = useLyraStore.getState();
        store.setCurrentTrack(track);
        store.setPlaybackMode(mode);
        store.setIsLoadingStream(true);
        store.setSearchResults([]); // Clear old results
        store.addToRecentlyPlayed(track);
        store.addToQueue(track);
        store.setQueueIndex(store.queue.length); // Point to the newly added track

        // Get stream URL
        try {
          if (mode === "music") {
            const cached = await lyraCheckAudioCache(track.id);
            if (cached) {
              store.setCachedAudioPath(cached);
              store.setIsLoadingStream(false);
              store.setIsPlaying(true);
            } else {
              const info = await lyraGetStreamUrl(track.id);
              store.setStreamUrls(info.video_url, info.audio_url);
              store.setIsLoadingStream(false);
              store.setIsPlaying(true);
              // Background cache
              lyraCacheAudio(track.id, track.title)
                .then((path) => {
                  if (useLyraStore.getState().currentTrack?.id === track.id) {
                    store.setCachedAudioPath(path);
                  }
                })
                .catch(() => {});
            }
          } else {
            const info = await lyraGetStreamUrl(track.id);
            store.setStreamUrls(info.video_url, info.audio_url);
            store.setIsLoadingStream(false);
            store.setIsPlaying(true);
          }
        } catch {
          store.setIsLoadingStream(false);
        }

        // Navigate to Lyra
        prefetchPage("lyra" as AppView);
        const entry = getConstellation("lyra" as ConstellationId);
        useAppStore
          .getState()
          .startWormhole("lyra" as ConstellationId, entry?.glowHex ?? "#ec4899");

        return [
          {
            type: "lyra_playing",
            handler: "lyra-commands",
            title: track.title,
            channel: track.channel,
            mode,
          },
        ];
      } catch {
        return [];
      }
    }

    return [];
  },

  ResultCard: LyraResultCard,
};
