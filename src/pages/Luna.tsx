import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Trash2,
  Globe,
  ArrowUp,
  PanelLeftOpen,
  PanelLeftClose,
  Plus,
  MessageSquare,
  X,
  Sparkles,
  RotateCcw,
  Pencil,
  Copy,
  Check,
  ExternalLink,
  CloudSun,
  Download,
  Link,
  ListTodo,
  StickyNote,
  Navigation,
  Wind,
  Droplets,
  Thermometer,
  Gauge,
  ArrowRight,
} from "lucide-react";
import TextareaAutosize from "react-textarea-autosize";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AiGlobe } from "../components/AiGlobe";
import {
  useAppStore,
  MAX_CONVERSATION_TITLE_LENGTH,
  type AppView,
} from "../store/useAppStore";
import { useOrbitStore } from "../store/useOrbitStore";
import { useSolarisStore } from "../store/useSolarisStore";
import { useHyperlaneStore } from "../store/useHyperlaneStore";
import { usePulsarStore } from "../store/usePulsarStore";
import {
  streamLuna,
  webSearch,
  pulsarDownload,
  pulsarGetDownloadsDir,
} from "../lib/tauri";
import type { ChatMessagePayload } from "../lib/tauri";
import { extractMemories } from "../lib/memory";
import type { ConstellationContext } from "../lib/luna-prompt";
import { weatherApi } from "../lib/weather";
import { WEATHER_CODES } from "../lib/weather-types";
import type {
  WeatherForecastResponse,
  GeocodingResult,
} from "../lib/weather-types";
import { modLabel } from "../lib/platform";
import type { FormatOption, AudioFormat } from "../store/usePulsarStore";

// ── Action result types ──────────────────────────────────────────────────────

type WeatherActionResult =
  | {
      type: "weather";
      location: string;
      locationObj: GeocodingResult;
      data: WeatherForecastResponse;
    }
  | { type: "weather_error"; location: string; error: string };

type HyperlaneActionResult =
  | { type: "short_url"; original: string; short: string }
  | { type: "short_url_error"; url: string; error: string };

type PulsarActionResult =
  | { type: "download_queued"; url: string; format: string; downloadId: string }
  | { type: "download_error"; url: string; error: string };

type NavigateActionResult = { type: "navigated"; to: string };

type OrbitActionResult = { type: "orbit_done"; count: number };

type ActionResult =
  | WeatherActionResult
  | HyperlaneActionResult
  | PulsarActionResult
  | NavigateActionResult
  | OrbitActionResult;

const COMMAND_BLOCK_TAGS = [
  "orbit-commands",
  "solaris-commands",
  "hyperlane-commands",
  "pulsar-commands",
  "navigate-commands",
] as const;

type ControlledView = Exclude<AppView, "luna" | "settings">;

// ── Helpers ──────────────────────────────────────────────────────────────────

function getCommandBlockBody(response: string, tag: string): string | null {
  const re = new RegExp("```" + tag + "\\r?\\n([\\s\\S]*?)(?:```|$)", "i");
  const match = response.match(re);
  return match?.[1] ?? null;
}

function stripTrailingAssistantCommandStart(content: string): string {
  const match = content.match(/\s*```([a-z-]*)$/i);
  if (!match) return content;

  const partialTag = (match[1] ?? "").toLowerCase();
  if (
    partialTag.length === 0 ||
    COMMAND_BLOCK_TAGS.some((tag) => tag.startsWith(partialTag))
  ) {
    return content.slice(0, content.length - match[0].length).trimEnd();
  }

  return content;
}

function stripAssistantCommandBlocks(content: string): string {
  const cleaned = COMMAND_BLOCK_TAGS.reduce((nextContent, tag) => {
    const re = new RegExp("\\s*```" + tag + "\\r?\\n[\\s\\S]*?(?:```|$)", "gi");
    return nextContent.replace(re, "");
  }, content);

  return stripTrailingAssistantCommandStart(cleaned).trimEnd();
}

function hasAssistantCommandBlocks(content: string): boolean {
  const lower = content.toLowerCase();
  return COMMAND_BLOCK_TAGS.some((tag) => lower.includes("```" + tag));
}

function normalizeNavigationTarget(value: unknown): ControlledView | null {
  const target = String(value ?? "")
    .trim()
    .toLowerCase() as ControlledView;
  return ["orbit", "solaris", "beacon", "hyperlane", "pulsar"].includes(target)
    ? target
    : null;
}

function inferNavigationTarget(text: string): ControlledView | null {
  const normalized = text.trim().toLowerCase();
  const patterns: Array<[ControlledView, RegExp]> = [
    [
      "orbit",
      /\b(?:open|go to|switch to|take me to|bring me to|show|navigate to)\s+(?:the\s+)?orbit\b/i,
    ],
    [
      "solaris",
      /\b(?:open|go to|switch to|take me to|bring me to|show|navigate to)\s+(?:the\s+)?solaris\b/i,
    ],
    [
      "beacon",
      /\b(?:open|go to|switch to|take me to|bring me to|show|navigate to)\s+(?:the\s+)?beacon\b/i,
    ],
    [
      "hyperlane",
      /\b(?:open|go to|switch to|take me to|bring me to|show|navigate to)\s+(?:the\s+)?hyperlane\b/i,
    ],
    [
      "pulsar",
      /\b(?:open|go to|switch to|take me to|bring me to|show|navigate to)\s+(?:the\s+)?pulsar\b/i,
    ],
  ];

  for (const [view, pattern] of patterns) {
    if (pattern.test(normalized)) return view;
  }

  return null;
}

function parseCommandBlock(
  response: string,
  tag: string,
): Record<string, unknown> | null {
  const body = getCommandBlockBody(response, tag);
  if (!body) return null;
  const line = body.trim().split("\n")[0].trim();
  const spaceIdx = line.indexOf(" ");
  if (spaceIdx === -1) return {};
  try {
    return JSON.parse(line.slice(spaceIdx + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function parseMultiCommandBlock(
  response: string,
  tag: string,
): Array<{ command: string; args: Record<string, unknown> }> {
  const body = getCommandBlockBody(response, tag);
  if (!body) return [];
  return body
    .trim()
    .split("\n")
    .flatMap((line) => {
      const trimmed = line.trim();
      if (!trimmed) return [];
      const spaceIdx = trimmed.indexOf(" ");
      const command = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
      const jsonStr = spaceIdx === -1 ? "{}" : trimmed.slice(spaceIdx + 1);
      try {
        return [
          { command, args: JSON.parse(jsonStr) as Record<string, unknown> },
        ];
      } catch {
        return [];
      }
    });
}

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

function weatherDescription(code: number): string {
  return WEATHER_CODES[code]?.description ?? "Unknown";
}

function weatherEmoji(code: number): string {
  return WEATHER_CODES[code]?.icon ?? "🌡️";
}

// ── Inline UI components ─────────────────────────────────────────────────────

function WeatherCard({ result }: { result: WeatherActionResult }) {
  if (result.type === "weather_error") {
    return (
      <div className="luna-action-card luna-action-card-error">
        <CloudSun size={14} style={{ flexShrink: 0 }} />
        <span>
          Weather unavailable for "{result.location}": {result.error}
        </span>
      </div>
    );
  }

  const { data, locationObj } = result;
  const current = data.current;
  const daily = data.daily;
  if (!current) return null;

  const code = current.weather_code ?? 0;
  const temp = current.temperature_2m ?? 0;
  const feelsLike = current.apparent_temperature ?? 0;
  const humidity = current.relative_humidity_2m ?? 0;
  const wind = current.wind_speed_10m ?? 0;
  const pressure = current.pressure_msl as number | undefined;
  const tempUnit = data.current_units?.temperature_2m ?? "°C";
  const windUnit = data.hourly_units?.wind_speed_10m ?? "km/h";

  const dayForecast = daily
    ? (daily.time ?? []).slice(1, 4).map((t, i) => ({
        date: t,
        code: daily.weather_code?.[i + 1] ?? 0,
        max: daily.temperature_2m_max?.[i + 1] ?? 0,
        min: daily.temperature_2m_min?.[i + 1] ?? 0,
      }))
    : [];

  const displayName =
    locationObj.name + (locationObj.country ? `, ${locationObj.country}` : "");

  return (
    <div className="luna-action-card luna-action-card-weather">
      <div className="luna-weather-header">
        <CloudSun
          size={13}
          style={{ color: "var(--color-nebula-teal)", flexShrink: 0 }}
        />
        <span className="luna-weather-city">{displayName}</span>
      </div>
      <div className="luna-weather-main">
        <span className="luna-weather-emoji">{weatherEmoji(code)}</span>
        <div>
          <div className="luna-weather-temp">
            {Math.round(temp)}
            {tempUnit}
          </div>
          <div className="luna-weather-desc">{weatherDescription(code)}</div>
        </div>
      </div>
      <div className="luna-weather-stats">
        <span title="Feels like">
          <Thermometer size={11} />
          {Math.round(feelsLike)}
          {tempUnit}
        </span>
        <span title="Humidity">
          <Droplets size={11} />
          {Math.round(humidity)}%
        </span>
        <span title="Wind">
          <Wind size={11} />
          {Math.round(wind)} {windUnit}
        </span>
        {pressure != null && (
          <span title="Pressure">
            <Gauge size={11} />
            {Math.round(pressure)} hPa
          </span>
        )}
      </div>
      {dayForecast.length > 0 && (
        <div className="luna-weather-forecast">
          {dayForecast.map((d) => (
            <div key={d.date} className="luna-weather-day">
              <span className="luna-weather-day-label">
                {new Date(d.date).toLocaleDateString("en-US", {
                  weekday: "short",
                })}
              </span>
              <span>{weatherEmoji(d.code)}</span>
              <span>
                {Math.round(d.max)}° / {Math.round(d.min)}°
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ShortUrlCard({ result }: { result: HyperlaneActionResult }) {
  const [copied, setCopied] = useState(false);

  if (result.type === "short_url_error") {
    return (
      <div className="luna-action-card luna-action-card-error">
        <Link size={14} style={{ flexShrink: 0 }} />
        <span>Could not shorten URL: {result.error}</span>
      </div>
    );
  }

  const handleCopy = () => {
    void navigator.clipboard.writeText(result.short).then(() => {
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
          {result.original.length > 50
            ? result.original.slice(0, 50) + "…"
            : result.original}
        </span>
        <ArrowRight
          size={12}
          style={{ color: "var(--color-text-secondary)", flexShrink: 0 }}
        />
        <a
          href={result.short}
          target="_blank"
          rel="noreferrer"
          className="luna-shorturl-short"
        >
          {result.short}
        </a>
      </div>
      <div className="luna-shorturl-actions">
        <button className="luna-card-btn" onClick={handleCopy}>
          {copied ? <Check size={12} /> : <Copy size={12} />}
          <span>{copied ? "Copied!" : "Copy"}</span>
        </button>
        <a
          href={result.short}
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

function DownloadCard({
  result,
  onGoToPulsar,
}: {
  result: PulsarActionResult;
  onGoToPulsar: () => void;
}) {
  if (result.type === "download_error") {
    return (
      <div className="luna-action-card luna-action-card-error">
        <Download size={14} style={{ flexShrink: 0 }} />
        <span>Download failed: {result.error}</span>
      </div>
    );
  }

  const formatLabel =
    result.format === "audio"
      ? "Audio"
      : result.format === "best"
        ? "Best quality"
        : result.format + "p";

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
        {result.url.length > 56 ? result.url.slice(0, 56) + "…" : result.url}
      </div>
      <button className="luna-card-btn" onClick={onGoToPulsar}>
        <ExternalLink size={12} />
        <span>View in Pulsar</span>
      </button>
    </div>
  );
}

function NavigatedCard({ result }: { result: NavigateActionResult }) {
  const labels: Record<string, string> = {
    orbit: "Orbit",
    solaris: "Solaris",
    beacon: "Beacon",
    hyperlane: "Hyperlane",
    pulsar: "Pulsar",
  };
  const icons: Record<string, React.ReactNode> = {
    orbit: <ListTodo size={13} />,
    solaris: <CloudSun size={13} />,
    beacon: <Navigation size={13} />,
    hyperlane: <Link size={13} />,
    pulsar: <Download size={13} />,
  };

  return (
    <div className="luna-action-card luna-action-card-navigate">
      <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
        <span style={{ color: "var(--color-nebula-teal)" }}>
          {icons[result.to]}
        </span>
        <span className="luna-navigate-label">
          Switched to {labels[result.to] ?? result.to}
        </span>
      </div>
    </div>
  );
}

function OrbitDoneCard({ result }: { result: OrbitActionResult }) {
  return (
    <div className="luna-action-card luna-action-card-orbit">
      <StickyNote
        size={13}
        style={{ color: "var(--color-nebula-teal)", flexShrink: 0 }}
      />
      <span>
        {result.count === 1
          ? "1 Orbit action executed"
          : `${result.count} Orbit actions executed`}
      </span>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function Luna() {
  const {
    conversations,
    activeConversationId,
    createConversation,
    switchConversation,
    deleteConversation,
    renameConversation,
    addMessage,
    updateLastAssistantMessage,
    clearMessages,
    removeLastAssistantMessage,
    removeFromLastUserMessage,
    memories,
    addMemory,
    isStreaming,
    setIsStreaming,
    hasDeepSeekKey,
    hasTavilyKey,
    setView,
    toggleConstellations,
    showConstellations,
  } = useAppStore();

  const {
    tasks,
    notes,
    createTask,
    completeTask,
    uncompleteTask,
    archiveTask,
    deleteTask,
    createNote,
    deleteNote,
  } = useOrbitStore();

  const { selectedLocation, setSelectedLocation } = useSolarisStore();
  const { addEntry: addHyperlaneEntry, findCached } = useHyperlaneStore();
  const { addDownload, updateDownload, outputDir, setOutputDir } =
    usePulsarStore();

  const activeConvo = conversations.find((c) => c.id === activeConversationId);
  const messages = activeConvo?.messages ?? [];

  const [input, setInput] = useState("");
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
  const [actionResults, setActionResults] = useState<
    Record<string, ActionResult[]>
  >({});
  const [pendingActions, setPendingActions] = useState<Set<string>>(new Set());
  const bottomRef = useRef<HTMLDivElement>(null);

  const sortedConversations = useMemo(
    () => [...conversations].sort((a, b) => b.updatedAt - a.updatedAt),
    [conversations],
  );

  const memoryStrings = useMemo(
    () => memories.map((m) => m.content),
    [memories],
  );

  const constellationCtx = useMemo(
    (): ConstellationContext => ({
      orbit: {
        activeTasks: tasks
          .filter((t) => !t.archived)
          .map((t) => ({
            id: t.id,
            title: t.title,
            description: t.description,
            priority: t.priority,
            due_date: t.due_date,
          })),
        notes: notes.map((n) => ({
          id: n.id,
          title: n.title,
          content: n.content,
        })),
      },
      solaris: {
        currentLocation:
          selectedLocation.name +
          (selectedLocation.country ? `, ${selectedLocation.country}` : ""),
      },
      pulsar: {
        activeDownloads: usePulsarStore
          .getState()
          .downloads.filter(
            (d) =>
              d.status === "downloading" ||
              d.status === "queued" ||
              d.status === "merging",
          ).length,
        outputDir,
      },
    }),
    [tasks, notes, selectedLocation, outputDir],
  );

  // Ensure output dir is set for Pulsar downloads initiated from Luna
  useEffect(() => {
    if (!outputDir) {
      pulsarGetDownloadsDir()
        .then(setOutputDir)
        .catch(() => {});
    }
  }, [outputDir, setOutputDir]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, actionResults]);

  // ── Constellation command executor ──────────────────────────────────────
  const executeCommands = useCallback(
    async (
      messageId: string,
      response: string,
      fallbackView: ControlledView | null,
    ) => {
      const results: ActionResult[] = [];

      // ── Orbit ─────────────────────────────────────────────────────────────
      const orbitCmds = parseMultiCommandBlock(response, "orbit-commands");
      let orbitCount = 0;
      for (const { command, args } of orbitCmds) {
        try {
          switch (command) {
            case "CREATE_TASK": {
              const rawDue = args.due_date;
              const dueDate =
                rawDue != null &&
                rawDue !== "null" &&
                typeof rawDue === "string" &&
                rawDue.trim() !== ""
                  ? rawDue
                  : null;
              createTask({
                title: String(args.title ?? ""),
                description:
                  args.description != null && args.description !== "null"
                    ? String(args.description)
                    : null,
                priority: (["low", "medium", "high"].includes(
                  String(args.priority),
                )
                  ? args.priority
                  : "medium") as "low" | "medium" | "high",
                due_date: dueDate,
              });
              orbitCount++;
              break;
            }
            case "COMPLETE_TASK":
              completeTask(String(args.id ?? ""));
              orbitCount++;
              break;
            case "UNCOMPLETE_TASK":
              uncompleteTask(String(args.id ?? ""));
              orbitCount++;
              break;
            case "ARCHIVE_TASK":
              archiveTask(String(args.id ?? ""));
              orbitCount++;
              break;
            case "DELETE_TASK":
              deleteTask(String(args.id ?? ""));
              orbitCount++;
              break;
            case "CREATE_NOTE":
              createNote({
                title: String(args.title ?? ""),
                content: args.content != null ? String(args.content) : null,
              });
              orbitCount++;
              break;
            case "DELETE_NOTE":
              deleteNote(String(args.id ?? ""));
              orbitCount++;
              break;
          }
        } catch {
          /* skip malformed */
        }
      }
      if (orbitCount > 0)
        results.push({ type: "orbit_done", count: orbitCount });

      // ── Solaris — weather ─────────────────────────────────────────────────
      const solarisArgs = parseCommandBlock(response, "solaris-commands");
      if (solarisArgs !== null && solarisArgs.location) {
        const locationQuery = String(solarisArgs.location);
        try {
          const locations = await weatherApi.searchLocations(locationQuery);
          if (!locations.length) throw new Error("Location not found");
          const loc = locations[0];
          const weatherData = await weatherApi.getForecast(
            loc.latitude,
            loc.longitude,
          );
          setSelectedLocation(loc);
          results.push({
            type: "weather",
            location: locationQuery,
            locationObj: loc,
            data: weatherData,
          });
        } catch (e) {
          results.push({
            type: "weather_error",
            location: locationQuery,
            error: String(e),
          });
        }
      }

      // ── Hyperlane — URL shortening ────────────────────────────────────────
      const hyperlaneArgs = parseCommandBlock(response, "hyperlane-commands");
      if (hyperlaneArgs !== null && hyperlaneArgs.url) {
        const originalUrl = String(hyperlaneArgs.url);
        const cached = findCached(originalUrl);
        try {
          const shortUrl = cached ?? (await shortenUrl(originalUrl));
          if (!cached) {
            addHyperlaneEntry({
              id: crypto.randomUUID(),
              original: originalUrl,
              short: shortUrl,
              createdAt: Date.now(),
            });
          }
          results.push({
            type: "short_url",
            original: originalUrl,
            short: shortUrl,
          });
        } catch (e) {
          results.push({
            type: "short_url_error",
            url: originalUrl,
            error: String(e),
          });
        }
      }

      // ── Pulsar — media download ───────────────────────────────────────────
      const pulsarArgs = parseCommandBlock(response, "pulsar-commands");
      if (pulsarArgs !== null && pulsarArgs.url) {
        const url = String(pulsarArgs.url);
        const format = (
          ["best", "audio", "720", "1080"].includes(
            String(pulsarArgs.format ?? "best"),
          )
            ? pulsarArgs.format
            : "best"
        ) as FormatOption;
        const audioFormat =
          (pulsarArgs.audio_format as AudioFormat | undefined) ?? "mp3";
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
        addDownload(item);
        try {
          const dir = outputDir || (await pulsarGetDownloadsDir());
          if (!outputDir) setOutputDir(dir);
          void pulsarDownload(
            downloadId,
            url,
            format,
            format === "audio" ? audioFormat : "mp3",
            dir,
            false,
            (event) => {
              if (event.type === "progress") {
                updateDownload(downloadId, {
                  status: "downloading",
                  progress: event.percent,
                  speed: event.speed,
                  eta: event.eta,
                });
              } else if (event.type === "done") {
                updateDownload(downloadId, {
                  status: "done",
                  progress: 100,
                  filePath: event.file_path ?? undefined,
                  filename: event.file_path ?? undefined,
                });
              } else if (event.type === "error") {
                updateDownload(downloadId, {
                  status: "error",
                  error: event.message,
                });
              } else if (event.type === "merging") {
                updateDownload(downloadId, {
                  status: "merging",
                  progress: 100,
                });
              }
            },
          );
          results.push({ type: "download_queued", url, format, downloadId });
        } catch (e) {
          updateDownload(downloadId, { status: "error", error: String(e) });
          results.push({ type: "download_error", url, error: String(e) });
        }
      }

      // ── Navigation ────────────────────────────────────────────────────────
      const navArgs = parseCommandBlock(response, "navigate-commands");
      const destination =
        normalizeNavigationTarget(navArgs?.to) ?? fallbackView;
      if (destination) {
        results.push({ type: "navigated", to: destination });
        setView(destination);
      }

      if (results.length > 0) {
        setActionResults((prev) => ({
          ...prev,
          [messageId]: [...(prev[messageId] ?? []), ...results],
        }));
      }

      setPendingActions((prev) => {
        const s = new Set(prev);
        s.delete(messageId);
        return s;
      });
    },
    [
      createTask,
      completeTask,
      uncompleteTask,
      archiveTask,
      deleteTask,
      createNote,
      deleteNote,
      setSelectedLocation,
      findCached,
      addHyperlaneEntry,
      addDownload,
      updateDownload,
      outputDir,
      setOutputDir,
      setView,
    ],
  );

  // ── Core send logic ───────────────────────────────────────────────────────
  const runStream = useCallback(
    async (
      text: string,
      historyMessages: ChatMessagePayload[],
      assistantMsgId: string,
      isFirstMessage: boolean,
      fallbackView: ControlledView | null,
    ) => {
      let accumulated = "";
      try {
        let searchContext = "";
        if (webSearchEnabled && hasTavilyKey) {
          try {
            const results = await webSearch(text);
            if (results.length > 0) {
              searchContext =
                "\n\n[Web search results]\n" +
                results
                  .slice(0, 5)
                  .map(
                    (r, i) =>
                      `${i + 1}. **${r.title}** (${r.url})\n${r.content}`,
                  )
                  .join("\n\n") +
                "\n[End of web search results]\n\n";
            }
          } catch {
            /* skip */
          }
        }

        await streamLuna(
          text,
          historyMessages,
          searchContext,
          (event) => {
            if (event.type === "chunk") {
              accumulated += event.text;
              updateLastAssistantMessage(
                stripAssistantCommandBlocks(accumulated),
              );
            }
          },
          memoryStrings,
          constellationCtx,
        );

        // Store clean content as final message
        updateLastAssistantMessage(stripAssistantCommandBlocks(accumulated));

        if (isFirstMessage && activeConversationId) {
          renameConversation(
            activeConversationId,
            text.slice(0, MAX_CONVERSATION_TITLE_LENGTH),
          );
        }

        const extracted = extractMemories(text, accumulated);
        for (const mem of extracted) addMemory(mem);
      } catch (e) {
        updateLastAssistantMessage(`Error: ${String(e)}`);
      } finally {
        setIsStreaming(false);
        const shouldExecute =
          hasAssistantCommandBlocks(accumulated) || fallbackView !== null;
        if (shouldExecute) {
          setPendingActions((prev) => new Set([...prev, assistantMsgId]));
          void executeCommands(assistantMsgId, accumulated, fallbackView);
        }
      }
    },
    [
      webSearchEnabled,
      hasTavilyKey,
      memoryStrings,
      constellationCtx,
      updateLastAssistantMessage,
      activeConversationId,
      renameConversation,
      addMemory,
      setIsStreaming,
      executeCommands,
    ],
  );

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isStreaming || !hasDeepSeekKey) return;
    if (!activeConversationId) createConversation();
    setInput("");
    const isFirstMessage = messages.length === 0;
    const fallbackView = inferNavigationTarget(text);
    addMessage({
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      timestamp: Date.now(),
    });
    setIsStreaming(true);
    const assistantMsgId = crypto.randomUUID();
    addMessage({
      id: assistantMsgId,
      role: "assistant",
      content: "",
      timestamp: Date.now(),
    });
    const historyMessages = messages
      .filter((m) => m.content.length > 0)
      .slice(-20)
      .map((m) => ({ role: m.role, content: m.content }));
    await runStream(
      text,
      historyMessages,
      assistantMsgId,
      isFirstMessage,
      fallbackView,
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const handleRetry = async () => {
    if (isStreaming) return;
    let lastUserIndex = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        lastUserIndex = i;
        break;
      }
    }
    if (lastUserIndex === -1) return;
    const lastUser = messages[lastUserIndex];
    const fallbackView = inferNavigationTarget(lastUser.content);
    removeLastAssistantMessage();
    setIsStreaming(true);
    const assistantMsgId = crypto.randomUUID();
    addMessage({
      id: assistantMsgId,
      role: "assistant",
      content: "",
      timestamp: Date.now(),
    });
    const historyMessages = messages
      .slice(0, lastUserIndex)
      .filter((m) => m.content.length > 0)
      .slice(-20)
      .map((m) => ({ role: m.role, content: m.content }));
    await runStream(
      lastUser.content,
      historyMessages,
      assistantMsgId,
      false,
      fallbackView,
    );
  };

  const handleEdit = () => {
    if (isStreaming) return;
    const content = removeFromLastUserMessage();
    if (content) setInput(content);
  };

  const isEmpty = messages.length === 0;
  const lastAssistantId = [...messages]
    .reverse()
    .find((m) => m.role === "assistant")?.id;
  const lastUserId = [...messages].reverse().find((m) => m.role === "user")?.id;

  return (
    <div className="luna-shell">
      {/* Sidebar */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            className="luna-sidebar"
            initial={{ x: -260, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -260, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            <div className="luna-sidebar-header">
              <button
                className="luna-sidebar-new"
                onClick={() => createConversation()}
              >
                <Plus size={14} />
                <span>New Conversation</span>
              </button>
              <button
                className="luna-tool-btn"
                onClick={() => setSidebarOpen(false)}
                title="Close sidebar"
              >
                <PanelLeftClose size={15} />
              </button>
            </div>
            <div className="luna-sidebar-list">
              {sortedConversations.map((c) => (
                <button
                  key={c.id}
                  className={`luna-sidebar-item ${c.id === activeConversationId ? "luna-sidebar-item-active" : ""}`}
                  onClick={() => switchConversation(c.id)}
                >
                  <MessageSquare size={13} className="luna-sidebar-item-icon" />
                  <span className="luna-sidebar-item-title">{c.title}</span>
                  <button
                    className="luna-sidebar-item-delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteConversation(c.id);
                    }}
                    title="Delete conversation"
                  >
                    <X size={12} />
                  </button>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main content */}
      <div className="luna-main">
        <div className="luna-messages">
          <AnimatePresence mode="wait">
            {isEmpty ? (
              <motion.div
                key="empty"
                className="luna-empty"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.35 }}
              >
                <AiGlobe size={240} />
                {!hasDeepSeekKey && (
                  <button
                    className="luna-settings-link"
                    onClick={() => setView("settings")}
                  >
                    Open Settings
                  </button>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="chat"
                className="luna-chat-list"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2 }}
              >
                {messages.map((msg, i) => {
                  const visibleAssistantContent =
                    msg.role === "assistant"
                      ? stripAssistantCommandBlocks(msg.content)
                      : "";
                  const actionCards = actionResults[msg.id] ?? [];
                  const hasPendingAction = pendingActions.has(msg.id);
                  const isStreamingAssistantPlaceholder =
                    msg.role === "assistant" &&
                    !msg.content &&
                    i === messages.length - 1 &&
                    isStreaming;
                  const shouldRenderAssistantBubble =
                    msg.role === "assistant" &&
                    (isStreamingAssistantPlaceholder ||
                      visibleAssistantContent.trim().length > 0);
                  const showMessageActions =
                    hoveredMessageId === msg.id &&
                    !isStreaming &&
                    (msg.id === lastAssistantId || msg.id === lastUserId);

                  return (
                    <motion.div
                      key={msg.id}
                      className={`luna-msg ${msg.role === "user" ? "luna-msg-user" : "luna-msg-ai"}`}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        duration: 0.25,
                        delay: Math.min(i * 0.03, 0.15),
                      }}
                      onMouseEnter={() => setHoveredMessageId(msg.id)}
                      onMouseLeave={() => setHoveredMessageId(null)}
                      style={{ position: "relative" }}
                    >
                      {(msg.role === "user" || shouldRenderAssistantBubble) && (
                        <div
                          className={`luna-bubble ${msg.role === "user" ? "luna-bubble-user" : "luna-bubble-ai"}`}
                        >
                          {isStreamingAssistantPlaceholder ? (
                            <div className="flex gap-1 items-center h-4">
                              <span className="typing-dot" />
                              <span className="typing-dot" />
                              <span className="typing-dot" />
                            </div>
                          ) : msg.role === "assistant" ? (
                            <div className="prose-starfield">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {visibleAssistantContent}
                              </ReactMarkdown>
                            </div>
                          ) : (
                            <span>{msg.content}</span>
                          )}
                        </div>
                      )}

                      {/* Action result cards */}
                      {msg.role === "assistant" && actionCards.length > 0 && (
                        <div className="luna-action-results">
                          {actionCards.map((result, ri) => {
                            if (
                              result.type === "weather" ||
                              result.type === "weather_error"
                            )
                              return <WeatherCard key={ri} result={result} />;
                            if (
                              result.type === "short_url" ||
                              result.type === "short_url_error"
                            )
                              return <ShortUrlCard key={ri} result={result} />;
                            if (
                              result.type === "download_queued" ||
                              result.type === "download_error"
                            )
                              return (
                                <DownloadCard
                                  key={ri}
                                  result={result}
                                  onGoToPulsar={() => setView("pulsar")}
                                />
                              );
                            if (result.type === "navigated")
                              return <NavigatedCard key={ri} result={result} />;
                            if (result.type === "orbit_done")
                              return <OrbitDoneCard key={ri} result={result} />;
                            return null;
                          })}
                        </div>
                      )}

                      {/* Pending indicator */}
                      {msg.role === "assistant" && hasPendingAction && (
                        <div className="luna-action-pending">
                          <span className="typing-dot" />
                          <span className="typing-dot" />
                          <span className="typing-dot" />
                          <span className="luna-action-pending-label">
                            Executing…
                          </span>
                        </div>
                      )}

                      {/* Hover action buttons */}
                      {showMessageActions && (
                        <div
                          className={`luna-msg-actions ${msg.role === "user" ? "luna-msg-actions-user" : "luna-msg-actions-ai"}`}
                        >
                          {msg.id === lastAssistantId && (
                            <button
                              className="luna-msg-action-btn"
                              title="Retry"
                              onClick={() => void handleRetry()}
                            >
                              <RotateCcw size={11} />
                            </button>
                          )}
                          {msg.id === lastUserId && (
                            <button
                              className="luna-msg-action-btn"
                              title="Edit"
                              onClick={handleEdit}
                            >
                              <Pencil size={11} />
                            </button>
                          )}
                        </div>
                      )}
                    </motion.div>
                  );
                })}
                <div ref={bottomRef} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Input area */}
        <div className="luna-input-area">
          <div className="luna-input-container">
            <div className="luna-toolbar">
              <div className="luna-toolbar-left">
                <button
                  onClick={() => setSidebarOpen((v) => !v)}
                  title="Toggle conversations"
                  className="luna-tool-btn"
                >
                  {sidebarOpen ? (
                    <PanelLeftClose size={13} />
                  ) : (
                    <PanelLeftOpen size={13} />
                  )}
                </button>
                <button
                  onClick={() => hasTavilyKey && setWebSearchEnabled((v) => !v)}
                  title={
                    hasTavilyKey
                      ? "Toggle web search"
                      : "Add Tavily key in Settings"
                  }
                  className={`luna-tool-btn ${webSearchEnabled && hasTavilyKey ? "luna-tool-btn-active" : ""}`}
                  style={{
                    cursor: hasTavilyKey ? "pointer" : "not-allowed",
                    opacity: hasTavilyKey ? 1 : 0.4,
                  }}
                >
                  <Globe size={13} />
                  <span>Search</span>
                </button>
                <button
                  onClick={toggleConstellations}
                  title={`Constellations (${modLabel}K)`}
                  className={`luna-tool-btn ${showConstellations ? "luna-tool-btn-active" : ""}`}
                >
                  <Sparkles size={13} />
                  <span>Constellations</span>
                </button>
              </div>
              {messages.length > 0 && (
                <button
                  onClick={clearMessages}
                  className="luna-tool-btn"
                  title="Clear conversation"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>

            <div className="luna-input-row">
              <TextareaAutosize
                className="luna-textarea"
                placeholder={
                  hasDeepSeekKey ? "Message Luna…" : "API key required…"
                }
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                minRows={1}
                maxRows={5}
                disabled={isStreaming || !hasDeepSeekKey}
              />
              <button
                className="luna-send-btn"
                onClick={() => void handleSend()}
                disabled={!input.trim() || isStreaming || !hasDeepSeekKey}
                title="Send"
              >
                <ArrowUp size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
