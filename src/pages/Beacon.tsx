import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FolderSearch,
  ArrowLeft,
  FolderOpen,
  GitBranch,
  ArrowRight,
  AlertCircle,
  Loader2,
  Clock,
  X,
  Send,
  Trash2,
  ChevronLeft,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import StarField from "../components/StarField";
import { useAppStore } from "../store/useAppStore";
import {
  useBeaconStore,
  type BeaconProject,
  type BeaconChatMessage,
} from "../store/useBeaconStore";
import { streamChat, getDeepSeekKey, scanLocalDirectory } from "../lib/tauri";
import { open as openDialog } from "@tauri-apps/plugin-dialog";

// ── Helpers ──────────────────────────────────────────────────────────────────

function uid() {
  return crypto.randomUUID();
}

const MAX_FILE_TREE_SIZE = 300;
const MAX_CODE_CONTEXT_FILES = 40;
const MAX_REPO_FILES = 500;

function timeAgo(ts: number | undefined): string {
  if (!ts) return "—";
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

function buildSystemPrompt(project: BeaconProject): string {
  const isGithub = project.source === "github";
  const locationLine = isGithub
    ? `It lives on GitHub at ${project.githubUrl ?? project.root}.`
    : `It is a local project at ${project.root}.`;

  const fileTree = project.files
    .slice(0, MAX_FILE_TREE_SIZE)
    .map((f) => f.relativePath)
    .join("\n");

  const codeContext = project.files
    .filter((f) => f.isText && f.content)
    .slice(0, MAX_CODE_CONTEXT_FILES)
    .map((f) => {
      const ext = f.relativePath.split(".").pop() ?? "";
      return `\`\`\`${ext}\n// ${f.relativePath}\n${f.content}\n\`\`\``;
    })
    .join("\n\n");

  return `You are Luna — a dry-witted, lightly sarcastic AI assistant embedded in Beacon (the code explorer constellation in Starfield). \
Think Ada from Satisfactory crossed with JARVIS from Iron Man: sharp, deadpan, never gushing, genuinely helpful. \
You have deeply analyzed the project "${project.name}" and know it inside out. ${locationLine}

When answering questions:
- Be specific and cite file paths when relevant (e.g. \`src/lib/tauri.ts\`).
- Be concise unless depth is warranted. Don't pad answers.
- If something is ambiguous in the code, say so instead of guessing.
- Use a touch of dry humour when it fits. Not every reply needs a joke — restraint is funnier.
- Never use phrases like "Certainly!", "Great question!", or "Of course!" — they are banned.

Project file tree:
\`\`\`
${fileTree}
\`\`\`${codeContext ? `\n\nKey source files (pre-loaded):\n\n${codeContext}` : ""}`;
}

// ── Recent Card ──────────────────────────────────────────────────────────────

interface RecentCardProps {
  project: BeaconProject;
  onOpen: (p: BeaconProject) => void;
  onRemove: (root: string) => void;
}

function RecentCard({ project, onOpen, onRemove }: RecentCardProps) {
  const isLocal = project.source === "local";
  const Icon = isLocal ? FolderOpen : GitBranch;
  const pathLabel = isLocal
    ? project.root
    : (project.githubUrl ?? project.root);

  return (
    <div
      className="glass rounded-xl p-4 group cursor-pointer transition-all duration-200 hover:-translate-y-px relative"
      onClick={() => onOpen(project)}
    >
      <button
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity win-btn"
        onClick={(e) => {
          e.stopPropagation();
          onRemove(project.root);
        }}
        title="Remove from recents"
      >
        <X size={11} />
      </button>
      <div className="flex items-start gap-3">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{
            background: isLocal
              ? "rgba(124,58,237,0.18)"
              : "rgba(20,184,166,0.12)",
            border: isLocal
              ? "1px solid rgba(124,58,237,0.3)"
              : "1px solid rgba(20,184,166,0.25)",
          }}
        >
          <Icon
            size={14}
            style={{
              color: isLocal
                ? "var(--color-purple-400)"
                : "var(--color-nebula-teal)",
            }}
          />
        </div>

        <div className="flex-1 min-w-0">
          <p
            className="text-sm font-semibold truncate leading-tight"
            style={{ color: "var(--color-text-primary)" }}
          >
            {project.name}
          </p>
          <p
            className="text-xs truncate mt-0.5 font-mono"
            style={{ color: "var(--color-text-dim)", fontSize: "0.68rem" }}
          >
            {pathLabel}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 pt-2">
        <span
          className="text-xs px-1.5 py-0.5 rounded font-medium"
          style={{
            background: isLocal
              ? "rgba(109,40,217,0.15)"
              : "rgba(20,184,166,0.1)",
            color: isLocal
              ? "var(--color-purple-400)"
              : "var(--color-nebula-teal)",
            fontSize: "0.68rem",
          }}
        >
          {isLocal ? "local" : "github"}
        </span>

        {project.fileCount > 0 && (
          <span
            className="text-xs"
            style={{ color: "var(--color-text-dim)", fontSize: "0.7rem" }}
          >
            {project.fileCount} files
          </span>
        )}

        <span
          className="text-xs ml-auto flex items-center gap-1"
          style={{ color: "var(--color-text-dim)", fontSize: "0.7rem" }}
        >
          <Clock size={9} />
          {timeAgo(project.indexedAt)}
        </span>
      </div>
    </div>
  );
}

// ── Home View (project picker) ───────────────────────────────────────────────

function BeaconHome() {
  const { hasDeepSeekKey } = useAppStore();
  const {
    setActiveProject,
    isIndexing,
    setIsIndexing,
    indexError,
    setIndexError,
    recentProjects,
    removeRecentProject,
    clearAllRecents,
    githubUrl,
    setGithubUrl,
  } = useBeaconStore();

  const [mode, setMode] = useState<"none" | "github">("none");
  const hasRecent = recentProjects.length > 0;

  const handleLocalFolder = async () => {
    if (!hasDeepSeekKey) {
      setIndexError("Enter your DeepSeek API key in Settings first.");
      return;
    }
    setIndexError(null);
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title: "Select a project folder",
      });
      if (!selected) return; // user cancelled

      setIsIndexing(true);
      const result = await scanLocalDirectory(selected);

      setActiveProject({
        name: result.name,
        root: result.root,
        source: "local",
        fileCount: result.fileCount,
        indexedAt: Date.now(),
        files: result.files.map((f) => ({
          path: f.path,
          relativePath: f.relativePath,
          size: f.size,
          isText: f.isText,
          content: f.content,
        })),
      });
    } catch (e) {
      setIndexError(String(e));
    } finally {
      setIsIndexing(false);
    }
  };

  const handleGithubImport = async () => {
    if (!hasDeepSeekKey) {
      setIndexError("Enter your DeepSeek API key in Settings first.");
      return;
    }
    if (!githubUrl.trim()) {
      setIndexError("Enter a GitHub repository URL.");
      return;
    }
    setIndexError(null);
    setIsIndexing(true);
    try {
      const match = githubUrl.match(/github\.com\/([^/]+\/[^/]+)/);
      const repoFullName = match?.[1]?.replace(/\.git$/, "");
      if (!repoFullName) {
        setIndexError("Invalid GitHub URL format. Use https://github.com/owner/repo");
        setIsIndexing(false);
        return;
      }
      const name = repoFullName.split("/")[1];

      // Fetch repository tree from GitHub API
      const response = await fetch(
        `https://api.github.com/repos/${repoFullName}/git/trees/HEAD?recursive=1`,
        { headers: { Accept: "application/vnd.github.v3+json" } },
      );
      if (!response.ok) throw new Error(`GitHub API error: ${response.status}`);
      const treeData = (await response.json()) as {
        tree: { path: string; type: string; size?: number }[];
      };

      const textExts = new Set([
        "ts", "tsx", "js", "jsx", "json", "md", "txt", "yaml", "yml",
        "toml", "rs", "py", "go", "java", "c", "h", "cpp", "css",
        "html", "vue", "svelte", "lock", "cfg", "ini", "sh", "bat",
        "env", "gitignore", "dockerfile",
      ]);

      const files = treeData.tree
        .filter((item) => item.type === "blob")
        .slice(0, MAX_REPO_FILES)
        .map((item) => {
          const ext = item.path.split(".").pop()?.toLowerCase() ?? "";
          return {
            path: item.path,
            relativePath: item.path,
            size: item.size ?? 0,
            isText: textExts.has(ext),
          };
        });

      // Fetch content for small text files (top 40 most important)
      const priorityFiles = files
        .filter((f) => f.isText && f.size < 50000)
        .sort((a, b) => {
          // Prioritize config/readme/main files
          const priority = (p: string) => {
            const lower = p.toLowerCase();
            if (lower.includes("readme")) return 0;
            if (lower.includes("package.json") || lower.includes("cargo.toml")) return 1;
            if (lower.includes("tsconfig") || lower.includes("vite.config")) return 2;
            if (lower.endsWith(".ts") || lower.endsWith(".tsx")) return 3;
            return 4;
          };
          return priority(a.path) - priority(b.path);
        })
        .slice(0, MAX_CODE_CONTEXT_FILES);

      const enrichedFiles = await Promise.all(
        priorityFiles.map(async (f) => {
          try {
            const contentResp = await fetch(
              `https://raw.githubusercontent.com/${repoFullName}/HEAD/${f.path}`,
            );
            if (contentResp.ok) {
              const content = await contentResp.text();
              return { ...f, content };
            }
          } catch {
            // ignore
          }
          return f;
        }),
      );

      const allFiles = files.map((f) => {
        const enriched = enrichedFiles.find((e) => e.path === f.path);
        return enriched ?? f;
      });

      setActiveProject({
        name,
        root: githubUrl.trim(),
        source: "github",
        githubUrl: githubUrl.trim(),
        fileCount: allFiles.length,
        indexedAt: Date.now(),
        files: allFiles,
      });
    } catch (e) {
      setIndexError(String(e));
    } finally {
      setIsIndexing(false);
    }
  };

  const handleOpenRecent = async (project: BeaconProject) => {
    if (!hasDeepSeekKey) {
      setIndexError("Enter your DeepSeek API key in Settings first.");
      return;
    }
    // For local projects, re-scan the directory to get fresh file contents
    if (project.source === "local") {
      setIndexError(null);
      setIsIndexing(true);
      try {
        const result = await scanLocalDirectory(project.root);
        setActiveProject({
          name: result.name,
          root: result.root,
          source: "local",
          fileCount: result.fileCount,
          indexedAt: Date.now(),
          files: result.files.map((f) => ({
            path: f.path,
            relativePath: f.relativePath,
            size: f.size,
            isText: f.isText,
            content: f.content,
          })),
        });
      } catch (e) {
        setIndexError(String(e));
      } finally {
        setIsIndexing(false);
      }
      return;
    }
    // For GitHub projects, just reopen them with cached data
    setActiveProject({
      ...project,
      files: project.files || [],
    });
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-8 gap-6">
      {/* Logo area */}
      <motion.div
        className="flex flex-col items-center gap-2"
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center"
          style={{
            background: "rgba(124, 79, 240, 0.15)",
            border: "1px solid rgba(124, 79, 240, 0.25)",
          }}
        >
          <FolderSearch size={32} style={{ color: "var(--color-purple-400)" }} />
        </div>
        <h2
          className="text-2xl font-bold"
          style={{ color: "var(--color-text-primary)" }}
        >
          Beacon
        </h2>
        <p
          className="text-sm text-center max-w-xs"
          style={{ color: "var(--color-text-muted)" }}
        >
          Point Luna at a project. Ask anything.
        </p>
      </motion.div>

      {/* Action cards */}
      <motion.div
        className="flex flex-col gap-2.5 w-full max-w-sm"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
      >
        {/* Open local folder */}
        <div className="glass rounded-xl overflow-hidden">
          <button
            className="flex items-center gap-3.5 px-4 py-3.5 text-left w-full transition-colors duration-200 group"
            onClick={() => { handleLocalFolder(); }}
            disabled={isIndexing}
          >
            <FolderOpen
              size={19}
              className="shrink-0"
              style={{ color: "var(--color-purple-400)" }}
            />
            <div className="flex-1 min-w-0">
              <p
                className="text-sm font-medium"
                style={{ color: "var(--color-text-primary)" }}
              >
                Open local folder
              </p>
              <p
                className="text-xs mt-0.5"
                style={{ color: "var(--color-text-muted)" }}
              >
                Browse and select a project on your machine
              </p>
            </div>
            {isIndexing ? (
              <Loader2
                size={14}
                className="shrink-0 animate-spin"
                style={{ color: "var(--color-purple-400)" }}
              />
            ) : (
              <ArrowRight
                size={14}
                className="shrink-0 opacity-0 group-hover:opacity-50 transition-all"
                style={{ color: "var(--color-purple-400)" }}
              />
            )}
          </button>
        </div>

        {/* Import GitHub repository */}
        <div className="glass rounded-xl overflow-hidden">
          <button
            className="flex items-center gap-3.5 px-4 py-3.5 text-left w-full transition-colors duration-200 group"
            onClick={() => setMode(mode === "github" ? "none" : "github")}
            disabled={isIndexing}
          >
            <GitBranch
              size={19}
              className="shrink-0"
              style={{ color: "var(--color-purple-400)" }}
            />
            <div className="flex-1 min-w-0">
              <p
                className="text-sm font-medium"
                style={{ color: "var(--color-text-primary)" }}
              >
                Import GitHub repository
              </p>
              <p
                className="text-xs mt-0.5"
                style={{ color: "var(--color-text-muted)" }}
              >
                Paste a public repo URL to analyze
              </p>
            </div>
            <ArrowRight
              size={14}
              className={`shrink-0 transition-all ${
                mode === "github"
                  ? "opacity-50 rotate-90"
                  : "opacity-0 group-hover:opacity-50"
              }`}
              style={{ color: "var(--color-purple-400)" }}
            />
          </button>

          <AnimatePresence>
            {mode === "github" && (
              <motion.div
                className="px-4 pb-4"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
              >
                <div className="flex gap-2">
                  <input
                    className="settings-input flex-1"
                    placeholder="https://github.com/owner/repo"
                    value={githubUrl}
                    onChange={(e) => setGithubUrl(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void handleGithubImport();
                    }}
                    autoFocus
                  />
                  <button
                    className="btn-send"
                    style={{
                      position: "static",
                      width: 38,
                      height: 38,
                      borderRadius: "var(--radius-md)",
                    }}
                    onClick={() => void handleGithubImport()}
                    disabled={isIndexing || !githubUrl.trim()}
                  >
                    {isIndexing ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <ArrowRight size={14} />
                    )}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Error */}
      {indexError && (
        <motion.div
          className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-lg w-full max-w-sm"
          style={{
            background: "rgba(239,68,68,0.12)",
            border: "1px solid rgba(239,68,68,0.3)",
            color: "#fca5a5",
          }}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <AlertCircle size={14} className="shrink-0" />
          <span>{indexError}</span>
        </motion.div>
      )}

      {/* No API key nudge */}
      {!hasDeepSeekKey && (
        <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
          No DeepSeek API key configured —{" "}
          <span style={{ color: "var(--color-purple-400)" }}>
            open Settings to add one
          </span>
        </p>
      )}

      {/* Recent projects */}
      {hasRecent && (
        <motion.div
          className="w-full max-w-lg"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
        >
          <div className="flex items-center gap-2.5 mb-3">
            <span
              className="text-xs font-semibold uppercase tracking-widest"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Recent
            </span>
            <span
              className="text-xs px-1.5 py-0.5 rounded font-medium"
              style={{
                background: "rgba(124,58,237,0.15)",
                color: "var(--color-purple-400)",
                fontSize: "0.68rem",
              }}
            >
              {recentProjects.length}
            </span>
            <button
              className="ml-auto text-xs transition-colors duration-150"
              style={{ color: "var(--color-text-dim)" }}
              onMouseEnter={(e) =>
                ((e.currentTarget as HTMLButtonElement).style.color = "#f87171")
              }
              onMouseLeave={(e) =>
                ((e.currentTarget as HTMLButtonElement).style.color =
                  "var(--color-text-dim)")
              }
              onClick={clearAllRecents}
              title="Clear all recent projects"
            >
              Clear all
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {recentProjects.map((p) => (
              <RecentCard
                key={p.root}
                project={p}
                onOpen={handleOpenRecent}
                onRemove={removeRecentProject}
              />
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}

// ── Chat View ────────────────────────────────────────────────────────────────

function BeaconChat() {
  const {
    activeProject,
    messages,
    addMessage,
    updateLastAssistantMessage,
    clearMessages,
    isStreaming,
    setIsStreaming,
    setActiveProject,
  } = useBeaconStore();

  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const streamBufferRef = useRef("");

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isStreaming || !activeProject) return;

    const apiKey = await getDeepSeekKey();
    if (!apiKey) {
      addMessage({
        id: uid(),
        role: "assistant",
        content:
          "I'd love to help, but you haven't given me an API key yet. Head to Settings and fix that.",
        timestamp: Date.now(),
      });
      return;
    }

    setInput("");

    const userMsg: BeaconChatMessage = {
      id: uid(),
      role: "user",
      content: text,
      timestamp: Date.now(),
    };
    addMessage(userMsg);

    const assistantMsg: BeaconChatMessage = {
      id: uid(),
      role: "assistant",
      content: "",
      timestamp: Date.now(),
    };
    addMessage(assistantMsg);
    setIsStreaming(true);
    streamBufferRef.current = "";

    try {
      const systemPrompt = buildSystemPrompt(activeProject);

      const history = messages
        .filter((m) => m.id !== assistantMsg.id)
        .slice(-20)
        .map((m) => ({
          role: (m.role === "user" ? "user" : "assistant") as "user" | "assistant",
          content: m.content,
        }));

      await streamChat(systemPrompt, history, text, (event) => {
        if (event.type === "chunk") {
          streamBufferRef.current += event.text;
          updateLastAssistantMessage(streamBufferRef.current);
        } else if (event.type === "done") {
          setIsStreaming(false);
        } else if (event.type === "error") {
          updateLastAssistantMessage(
            `**Error:** ${event.message}\n\nSomething went wrong. Check your API key just in case.`,
          );
          setIsStreaming(false);
        }
      });
    } catch (e) {
      updateLastAssistantMessage(
        `**Error:** ${String(e)}\n\nWell, that didn't work.`,
      );
      setIsStreaming(false);
    }
  }, [
    input,
    isStreaming,
    messages,
    addMessage,
    updateLastAssistantMessage,
    activeProject,
    setIsStreaming,
  ]);

  if (!activeProject) return null;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Project header */}
      <div
        className="flex items-center gap-2.5 px-4 py-2 shrink-0"
        style={{ borderBottom: "1px solid var(--color-border-dim)" }}
      >
        <button
          className="win-btn shrink-0"
          onClick={() => setActiveProject(null)}
          title="Back to project list"
        >
          <ChevronLeft size={14} />
        </button>

        <div className="flex-1 min-w-0">
          <p
            className="text-sm font-semibold truncate leading-tight"
            style={{ color: "var(--color-text-primary)" }}
          >
            {activeProject.name}
          </p>
          <p
            className="text-xs truncate"
            style={{ color: "var(--color-text-muted)", marginTop: 1 }}
          >
            {activeProject.source === "local"
              ? `${activeProject.fileCount} files · ${activeProject.root}`
              : activeProject.githubUrl}
          </p>
        </div>

        <button
          className="win-btn"
          onClick={clearMessages}
          title="Clear chat history"
        >
          <Trash2 size={13} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 min-h-0">
        {messages.length === 0 && (
          <motion.div
            className="flex flex-col items-center gap-4 mt-14"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <FolderSearch
              size={48}
              style={{ color: "var(--color-purple-400)", opacity: 0.7 }}
            />
            <div className="text-center space-y-1.5" style={{ maxWidth: 320 }}>
              <p
                className="text-sm font-medium"
                style={{ color: "var(--color-text-secondary)" }}
              >
                {activeProject.name}
              </p>
              <p
                className="text-sm"
                style={{ color: "var(--color-text-muted)" }}
              >
                Luna has reviewed{" "}
                {activeProject.fileCount > 0
                  ? `${activeProject.fileCount} files`
                  : "the project"}{" "}
                and has opinions. Ask away.
              </p>
            </div>

            <div className="flex flex-wrap gap-2 justify-center mt-1">
              {[
                "Give me an overview of this codebase",
                "What are the main entry points?",
                "Any obvious issues or improvements?",
              ].map((prompt) => (
                <button
                  key={prompt}
                  className="text-xs px-3 py-1.5 rounded-full transition-all duration-150"
                  style={{
                    background: "rgba(18,16,40,0.7)",
                    border: "1px solid var(--color-border-dim)",
                    color: "var(--color-text-secondary)",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor =
                      "rgba(124,58,237,0.4)";
                    (e.currentTarget as HTMLButtonElement).style.color =
                      "var(--color-purple-300)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor =
                      "var(--color-border-dim)";
                    (e.currentTarget as HTMLButtonElement).style.color =
                      "var(--color-text-secondary)";
                  }}
                  onClick={() => setInput(prompt)}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </motion.div>
        )}

        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >
              <div
                className={`max-w-[75%] px-4 py-3 text-sm rounded-xl ${
                  msg.role === "user"
                    ? ""
                    : ""
                }`}
                style={
                  msg.role === "user"
                    ? {
                        background: "rgba(124, 79, 240, 0.2)",
                        border: "1px solid rgba(124, 79, 240, 0.3)",
                        color: "var(--color-text-primary)",
                      }
                    : {
                        background: "rgba(16, 15, 46, 0.6)",
                        border: "1px solid rgba(37, 34, 96, 0.6)",
                        color: "var(--color-text-primary)",
                      }
                }
              >
                {msg.role === "assistant" && msg.content === "" ? (
                  <span className="flex gap-1.5 items-center py-0.5">
                    <span
                      className="w-1.5 h-1.5 rounded-full animate-pulse"
                      style={{ background: "var(--color-purple-400)" }}
                    />
                    <span
                      className="w-1.5 h-1.5 rounded-full animate-pulse"
                      style={{
                        background: "var(--color-purple-400)",
                        animationDelay: "0.2s",
                      }}
                    />
                    <span
                      className="w-1.5 h-1.5 rounded-full animate-pulse"
                      style={{
                        background: "var(--color-purple-400)",
                        animationDelay: "0.4s",
                      }}
                    />
                  </span>
                ) : msg.role === "assistant" ? (
                  <div className="prose-starfield">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <span style={{ whiteSpace: "pre-wrap" }}>{msg.content}</span>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        <div ref={messagesEndRef} />
      </div>

      {/* Chat input */}
      <div
        className="px-4 pb-3.5 pt-2.5"
        style={{ borderTop: "1px solid var(--color-border-dim)" }}
      >
        <div className="flex items-center gap-2.5">
          <input
            className="settings-input flex-1"
            placeholder="Ask Luna about the project…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void sendMessage();
              }
            }}
            disabled={isStreaming}
          />
          <button
            className="btn-send"
            style={{
              position: "static",
              width: 38,
              height: 38,
              borderRadius: "var(--radius-md)",
            }}
            onClick={() => void sendMessage()}
            disabled={isStreaming || !input.trim()}
            title="Send (Enter)"
          >
            {isStreaming ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Send size={14} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Beacon Page ─────────────────────────────────────────────────────────

export default function Beacon() {
  const { goBack } = useAppStore();
  const { activeProject } = useBeaconStore();

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
            title="Back"
          >
            <ArrowLeft size={14} />
          </button>
          <FolderSearch
            size={16}
            style={{ color: "var(--color-purple-400)" }}
          />
          <span
            className="text-sm font-semibold"
            style={{ color: "var(--color-text-primary)" }}
          >
            Beacon
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

        {/* Content: Home or Chat */}
        {activeProject ? <BeaconChat /> : <BeaconHome />}
      </div>
    </div>
  );
}
