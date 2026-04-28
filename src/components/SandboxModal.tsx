import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Copy, Check, Code, LayoutList, BarChart3, Eye } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { useSandboxStore } from "../store/useSandboxStore";

// ── Chart parsing ────────────────────────────────────────────────────────────

interface ChartSeries {
  key: string;
  color?: string;
  name?: string;
}

interface ChartConfig {
  chartType: "bar" | "line" | "area" | "pie";
  data: Record<string, unknown>[];
  xKey: string;
  series: ChartSeries[];
}

const DEFAULT_COLORS = [
  "#7c4ff0",
  "#14b8a6",
  "#d946ef",
  "#6366f1",
  "#f59e0b",
  "#ef4444",
  "#22c55e",
  "#3b82f6",
];

function parseChartConfig(content: string): ChartConfig | null {
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    if (
      !parsed.chartType ||
      !Array.isArray(parsed.data) ||
      !parsed.xKey ||
      !Array.isArray(parsed.series)
    ) {
      return null;
    }
    return parsed as unknown as ChartConfig;
  } catch {
    return null;
  }
}

// ── Chart renderer ───────────────────────────────────────────────────────────

function SandboxChart({ config }: { config: ChartConfig }) {
  const { chartType, data, xKey, series } = config;

  const seriesWithColors = series.map((s, i) => ({
    ...s,
    color: s.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length],
    name: s.name ?? s.key,
  }));

  const tooltipStyle = {
    backgroundColor: "rgba(16, 15, 46, 0.95)",
    border: "1px solid rgba(124, 79, 240, 0.25)",
    borderRadius: "8px",
    color: "#ede9fe",
    fontSize: "0.8rem",
  };

  if (chartType === "pie") {
    const pieKey = seriesWithColors[0]?.key;
    if (!pieKey) return <p className="sandbox-chart-error">No series key</p>;
    return (
      <ResponsiveContainer width="100%" height={360}>
        <PieChart>
          <Pie
            data={data}
            dataKey={pieKey}
            nameKey={xKey}
            cx="50%"
            cy="50%"
            outerRadius={130}
            stroke="rgba(0,0,0,0.3)"
            strokeWidth={2}
            label={({ name, percent }: { name?: string; percent?: number }) =>
              `${name ?? ""}: ${((percent ?? 0) * 100).toFixed(0)}%`
            }
          >
            {data.map((_, i) => (
              <Cell
                key={i}
                fill={DEFAULT_COLORS[i % DEFAULT_COLORS.length]}
              />
            ))}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  const ChartComponent =
    chartType === "line"
      ? LineChart
      : chartType === "area"
        ? AreaChart
        : BarChart;

  return (
    <ResponsiveContainer width="100%" height={360}>
      <ChartComponent data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(124, 79, 240, 0.1)" />
        <XAxis
          dataKey={xKey}
          tick={{ fill: "#9d90d4", fontSize: 12 }}
          stroke="rgba(124, 79, 240, 0.2)"
        />
        <YAxis
          tick={{ fill: "#9d90d4", fontSize: 12 }}
          stroke="rgba(124, 79, 240, 0.2)"
        />
        <Tooltip contentStyle={tooltipStyle} />
        <Legend />
        {seriesWithColors.map((s) => {
          if (chartType === "line") {
            return (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                stroke={s.color}
                strokeWidth={2}
                dot={{ fill: s.color, r: 3 }}
                name={s.name}
              />
            );
          }
          if (chartType === "area") {
            return (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                stroke={s.color}
                fill={s.color}
                fillOpacity={0.15}
                strokeWidth={2}
                name={s.name}
              />
            );
          }
          return (
            <Bar
              key={s.key}
              dataKey={s.key}
              fill={s.color}
              radius={[4, 4, 0, 0]}
              name={s.name}
            />
          );
        })}
      </ChartComponent>
    </ResponsiveContainer>
  );
}

// ── Preview support ──────────────────────────────────────────────────────────

const WEB_PREVIEW_LANGUAGES = new Set([
  "html",
  "css",
  "javascript",
  "js",
  "typescript",
  "ts",
]);

function isPreviewable(language?: string): boolean {
  return !!language && WEB_PREVIEW_LANGUAGES.has(language.toLowerCase());
}

/** Wraps bare CSS or JS in a minimal HTML document for preview. */
function buildPreviewDoc(content: string, language: string): string {
  const lang = language.toLowerCase();
  if (lang === "css") {
    // Escape </style> to prevent breaking out of the style tag
    const safeContent = content.replace(/<\/style/gi, "<\\/style");
    return `<!DOCTYPE html><html><head><style>${safeContent}</style></head><body><p style="font-family:sans-serif;padding:1rem;color:#ccc">CSS preview — add HTML elements to see results.</p></body></html>`;
  }
  if (lang === "javascript" || lang === "js") {
    // Escape </script> to prevent breaking out of the script tag
    const safeContent = content.replace(/<\/script/gi, "<\\/script");
    return `<!DOCTYPE html><html><head></head><body><script>${safeContent}</script></body></html>`;
  }
  if (lang === "typescript" || lang === "ts") {
    return `<!DOCTYPE html><html><head></head><body><pre style="font-family:monospace;padding:1rem;color:#ccc;background:#0a0a1a;margin:0">TypeScript preview is not available in the browser sandbox.\nView the code tab for the source.</pre></body></html>`;
  }
  // html — rendered as-is; the iframe sandbox="allow-scripts" isolates execution
  return content;
}

// ── Main modal ───────────────────────────────────────────────────────────────

export default function SandboxModal() {
  const { isOpen, activeItem, close, items, openById } = useSandboxStore();
  const [copied, setCopied] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);

  const chartConfig = useMemo(() => {
    if (!activeItem || activeItem.type !== "chart") return null;
    return parseChartConfig(activeItem.content);
  }, [activeItem]);

  const canPreview =
    activeItem?.type === "code" && isPreviewable(activeItem.language);

  const previewDoc = useMemo(() => {
    if (!canPreview || !activeItem?.language) return "";
    return buildPreviewDoc(activeItem.content, activeItem.language);
  }, [canPreview, activeItem]);

  // Reset preview mode when switching items
  const handleOpenById = (id: string) => {
    setPreviewMode(false);
    openById(id);
  };

  const handleCopy = () => {
    if (!activeItem) return;
    void navigator.clipboard.writeText(activeItem.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const typeIcon =
    activeItem?.type === "code" ? (
      <Code size={16} />
    ) : activeItem?.type === "chart" ? (
      <BarChart3 size={16} />
    ) : (
      <LayoutList size={16} />
    );

  return (
    <AnimatePresence>
      {isOpen && activeItem && (
        <motion.div
          className="sandbox-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={close}
        >
          <motion.div
            className="sandbox-modal"
            initial={{ scale: 0.96, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 12 }}
            transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="sandbox-header">
              <div className="sandbox-header-left">
                {typeIcon}
                <h2 className="sandbox-title">{activeItem.title}</h2>
                {activeItem.type === "code" && activeItem.language && (
                  <span className="sandbox-lang-badge">
                    {activeItem.language}
                  </span>
                )}
              </div>
              <div className="sandbox-header-actions">
                {canPreview && (
                  <div className="sandbox-view-toggle">
                    <button
                      className={`sandbox-view-tab ${!previewMode ? "sandbox-view-tab-active" : ""}`}
                      onClick={() => setPreviewMode(false)}
                      title="View source code"
                    >
                      <Code size={13} />
                      <span>Code</span>
                    </button>
                    <button
                      className={`sandbox-view-tab ${previewMode ? "sandbox-view-tab-active" : ""}`}
                      onClick={() => setPreviewMode(true)}
                      title="Live preview"
                    >
                      <Eye size={13} />
                      <span>Preview</span>
                    </button>
                  </div>
                )}
                <button
                  className="sandbox-action-btn"
                  onClick={handleCopy}
                  title="Copy content"
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  <span>{copied ? "Copied" : "Copy"}</span>
                </button>
                <button
                  className="sandbox-close-btn"
                  onClick={close}
                  title="Close sandbox"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="sandbox-content">
              {activeItem.type === "code" && !previewMode && (
                <pre className="sandbox-code">
                  <code>{activeItem.content}</code>
                </pre>
              )}

              {activeItem.type === "code" && previewMode && canPreview && (
                <iframe
                  className="sandbox-preview"
                  srcDoc={previewDoc}
                  sandbox="allow-scripts"
                  title="Code preview"
                  referrerPolicy="no-referrer"
                />
              )}

              {activeItem.type === "plan" && (
                <div className="sandbox-plan prose-starfield">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {activeItem.content}
                  </ReactMarkdown>
                </div>
              )}

              {activeItem.type === "chart" && chartConfig && (
                <div className="sandbox-chart">
                  <SandboxChart config={chartConfig} />
                </div>
              )}

              {activeItem.type === "chart" && !chartConfig && (
                <div className="sandbox-chart-error">
                  <p>Could not parse chart data. Expected JSON: {`{"chartType":"bar|line|area|pie", "data":[...], "xKey":"...", "series":[{"key":"..."}]}`}</p>
                </div>
              )}
            </div>

            {/* History sidebar strip */}
            {items.length > 1 && (
              <div className="sandbox-history">
                <span className="sandbox-history-label">History</span>
                <div className="sandbox-history-list">
                  {[...items].reverse().map((item) => (
                    <button
                      key={item.id}
                      className={`sandbox-history-item ${item.id === activeItem.id ? "sandbox-history-item-active" : ""}`}
                      onClick={() => handleOpenById(item.id)}
                      title={item.title}
                    >
                      {item.type === "code" ? (
                        <Code size={11} />
                      ) : item.type === "chart" ? (
                        <BarChart3 size={11} />
                      ) : (
                        <LayoutList size={11} />
                      )}
                      <span className="sandbox-history-item-title">
                        {item.title}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
