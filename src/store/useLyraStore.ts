import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface LyraTrack {
  id: string;
  title: string;
  channel: string;
  duration: number;
  thumbnail: string;
  viewCount: number;
}

export type PlaybackMode = "video" | "music";

export type RepeatMode = "off" | "one" | "all";

interface LyraStore {
  // Search
  searchQuery: string;
  searchResults: LyraTrack[];
  isSearching: boolean;
  setSearchQuery: (q: string) => void;
  setSearchResults: (results: LyraTrack[]) => void;
  setIsSearching: (v: boolean) => void;

  // Playback
  currentTrack: LyraTrack | null;
  playbackMode: PlaybackMode;
  isPlaying: boolean;
  volume: number;
  currentTime: number;
  duration: number;
  shuffle: boolean;
  repeat: RepeatMode;
  setCurrentTrack: (track: LyraTrack | null) => void;
  setPlaybackMode: (mode: PlaybackMode) => void;
  setIsPlaying: (v: boolean) => void;
  setVolume: (v: number) => void;
  setCurrentTime: (t: number) => void;
  setDuration: (d: number) => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;

  // Queue
  queue: LyraTrack[];
  queueIndex: number;
  addToQueue: (track: LyraTrack) => void;
  removeFromQueue: (index: number) => void;
  clearQueue: () => void;
  setQueueIndex: (i: number) => void;
  playNext: () => LyraTrack | null;
  playPrevious: () => LyraTrack | null;

  // History
  recentlyPlayed: LyraTrack[];
  addToRecentlyPlayed: (track: LyraTrack) => void;
  clearRecentlyPlayed: () => void;

  // Stream URLs (ephemeral, not persisted)
  streamVideoUrl: string | null;
  streamAudioUrl: string | null;
  isLoadingStream: boolean;
  setStreamUrls: (video: string | null, audio: string | null) => void;
  setIsLoadingStream: (v: boolean) => void;

  // Cache status
  isCachingAudio: boolean;
  setIsCachingAudio: (v: boolean) => void;
  cachedAudioPath: string | null;
  setCachedAudioPath: (p: string | null) => void;
}

export const useLyraStore = create<LyraStore>()(
  persist(
    (set, get) => ({
      // Search
      searchQuery: "",
      searchResults: [],
      isSearching: false,
      setSearchQuery: (q) => set({ searchQuery: q }),
      setSearchResults: (results) => set({ searchResults: results }),
      setIsSearching: (v) => set({ isSearching: v }),

      // Playback
      currentTrack: null,
      playbackMode: "music",
      isPlaying: false,
      volume: 0.8,
      currentTime: 0,
      duration: 0,
      shuffle: false,
      repeat: "off",
      setCurrentTrack: (track) => set({ currentTrack: track }),
      setPlaybackMode: (mode) => set({ playbackMode: mode }),
      setIsPlaying: (v) => set({ isPlaying: v }),
      setVolume: (v) => set({ volume: v }),
      setCurrentTime: (t) => set({ currentTime: t }),
      setDuration: (d) => set({ duration: d }),
      toggleShuffle: () => set((s) => ({ shuffle: !s.shuffle })),
      cycleRepeat: () =>
        set((s) => ({
          repeat:
            s.repeat === "off" ? "all" : s.repeat === "all" ? "one" : "off",
        })),

      // Queue
      queue: [],
      queueIndex: -1,
      addToQueue: (track) =>
        set((s) => ({ queue: [...s.queue, track] })),
      removeFromQueue: (index) =>
        set((s) => ({
          queue: s.queue.filter((_, i) => i !== index),
          queueIndex:
            index < s.queueIndex
              ? s.queueIndex - 1
              : index === s.queueIndex
                ? -1
                : s.queueIndex,
        })),
      clearQueue: () => set({ queue: [], queueIndex: -1 }),
      setQueueIndex: (i) => set({ queueIndex: i }),

      playNext: () => {
        const { queue, queueIndex, shuffle, repeat } = get();
        if (queue.length === 0) return null;

        let nextIndex: number;
        if (repeat === "one") {
          nextIndex = queueIndex;
        } else if (shuffle) {
          if (queue.length === 1) {
            nextIndex = 0;
          } else {
            // Exclude current track from random selection
            do {
              nextIndex = Math.floor(Math.random() * queue.length);
            } while (nextIndex === queueIndex);
          }
        } else {
          nextIndex = queueIndex + 1;
          if (nextIndex >= queue.length) {
            if (repeat === "all") {
              nextIndex = 0;
            } else {
              return null;
            }
          }
        }

        const track = queue[nextIndex];
        set({ queueIndex: nextIndex, currentTrack: track, isPlaying: true });
        return track;
      },

      playPrevious: () => {
        const { queue, queueIndex, repeat } = get();
        if (queue.length === 0) return null;

        let prevIndex = queueIndex - 1;
        if (prevIndex < 0) {
          if (repeat === "all") {
            prevIndex = queue.length - 1;
          } else {
            prevIndex = 0;
          }
        }

        const track = queue[prevIndex];
        set({ queueIndex: prevIndex, currentTrack: track, isPlaying: true });
        return track;
      },

      // History
      recentlyPlayed: [],
      addToRecentlyPlayed: (track) =>
        set((s) => ({
          recentlyPlayed: [
            track,
            ...s.recentlyPlayed.filter((t) => t.id !== track.id),
          ].slice(0, 50),
        })),
      clearRecentlyPlayed: () => set({ recentlyPlayed: [] }),

      // Stream URLs (ephemeral)
      streamVideoUrl: null,
      streamAudioUrl: null,
      isLoadingStream: false,
      setStreamUrls: (video, audio) =>
        set({ streamVideoUrl: video, streamAudioUrl: audio }),
      setIsLoadingStream: (v) => set({ isLoadingStream: v }),

      // Cache status
      isCachingAudio: false,
      setIsCachingAudio: (v) => set({ isCachingAudio: v }),
      cachedAudioPath: null,
      setCachedAudioPath: (p) => set({ cachedAudioPath: p }),
    }),
    {
      name: "starfield-lyra",
      partialize: (s) => ({
        playbackMode: s.playbackMode,
        volume: s.volume,
        shuffle: s.shuffle,
        repeat: s.repeat,
        recentlyPlayed: s.recentlyPlayed.slice(0, 50),
        queue: s.queue.slice(0, 100),
      }),
    },
  ),
);
