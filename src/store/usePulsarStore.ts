import { create } from "zustand";
import { persist } from "zustand/middleware";

export type DownloadStatus =
  | "queued"
  | "downloading"
  | "merging"
  | "done"
  | "error"
  | "cancelled";

export type FormatOption = "best" | "audio" | "720" | "1080";

export interface DownloadItem {
  id: string;
  url: string;
  format: FormatOption;
  status: DownloadStatus;
  /** 0–100 */
  progress: number;
  speed: string;
  eta: string;
  filePath?: string;
  error?: string;
  /** Filename inferred from yt-dlp destination line */
  filename?: string;
  /** Playlist tracking */
  playlistIndex?: number;
  playlistTotal?: number;
  createdAt: number;
}

interface PulsarStore {
  downloads: DownloadItem[];
  outputDir: string;

  setOutputDir: (dir: string) => void;
  addDownload: (item: DownloadItem) => void;
  updateDownload: (id: string, patch: Partial<DownloadItem>) => void;
  removeDownload: (id: string) => void;
  clearCompleted: () => void;
}

export const usePulsarStore = create<PulsarStore>()(
  persist(
    (set) => ({
      downloads: [],
      outputDir: "",

      setOutputDir: (dir) => set({ outputDir: dir }),

      addDownload: (item) =>
        set((s) => ({ downloads: [item, ...s.downloads] })),

      updateDownload: (id, patch) =>
        set((s) => ({
          downloads: s.downloads.map((d) =>
            d.id === id ? { ...d, ...patch } : d,
          ),
        })),

      removeDownload: (id) =>
        set((s) => ({ downloads: s.downloads.filter((d) => d.id !== id) })),

      clearCompleted: () =>
        set((s) => ({
          downloads: s.downloads.filter(
            (d) => d.status === "downloading" || d.status === "queued" || d.status === "merging",
          ),
        })),
    }),
    {
      name: "starfield-pulsar",
      partialize: (s) => ({
        outputDir: s.outputDir,
        // Persist only terminal downloads (not active ones)
        downloads: s.downloads
          .filter((d) => d.status === "done" || d.status === "error" || d.status === "cancelled")
          .slice(0, 50),
      }),
    },
  ),
);
