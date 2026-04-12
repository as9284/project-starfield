import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Search,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Repeat,
  Repeat1,
  Shuffle,
  Music,
  Video,
  ListMusic,
  Plus,
  X,
  Loader2,
  Radio,
  Clock,
  Eye,
  ChevronDown,
  ChevronUp,
  Disc3,
  HardDrive,
} from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { useLyraStore, type LyraTrack, type PlaybackMode } from "../store/useLyraStore";
import {
  lyraSearch,
  lyraGetStreamUrl,
  lyraCacheAudio,
  lyraCheckAudioCache,
  pulsarCheckYtdlp,
  pulsarInstallYtdlp,
} from "../lib/tauri";

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatViewCount(count: number): string {
  if (count >= 1_000_000_000) return `${(count / 1_000_000_000).toFixed(1)}B`;
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return count.toString();
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function Lyra() {
  const goBack = useAppStore((s) => s.goBack);
  const {
    searchQuery, setSearchQuery, searchResults, setSearchResults,
    isSearching, setIsSearching,
    currentTrack, setCurrentTrack,
    playbackMode, setPlaybackMode,
    isPlaying, setIsPlaying,
    volume, setVolume,
    shuffle, toggleShuffle,
    repeat, cycleRepeat,
    queue, addToQueue, removeFromQueue, clearQueue, queueIndex, setQueueIndex,
    recentlyPlayed, addToRecentlyPlayed,
    streamVideoUrl, streamAudioUrl, setStreamUrls,
    isLoadingStream, setIsLoadingStream,
    isCachingAudio, setIsCachingAudio,
    cachedAudioPath, setCachedAudioPath,
    currentTime, setCurrentTime,
    duration, setDuration,
    playNext, playPrevious,
  } = useLyraStore();

  const [hasYtdlp, setHasYtdlp] = useState<boolean | null>(null);
  const [isInstallingYtdlp, setIsInstallingYtdlp] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const audioRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Check yt-dlp on mount
  useEffect(() => {
    pulsarCheckYtdlp()
      .then((found) => setHasYtdlp(found))
      .catch(() => setHasYtdlp(false));
  }, []);

  const handleInstallYtdlp = async () => {
    setIsInstallingYtdlp(true);
    try {
      const ok = await pulsarInstallYtdlp();
      setHasYtdlp(ok);
    } catch {
      setHasYtdlp(false);
    } finally {
      setIsInstallingYtdlp(false);
    }
  };

  // ── Search handler ─────────────────────────────────────────────────────
  const handleSearch = useCallback(async () => {
    const q = searchQuery.trim();
    if (!q) return;
    setIsSearching(true);
    try {
      const results = await lyraSearch(q, 12);
      const tracks: LyraTrack[] = results.map((r) => ({
        id: r.id,
        title: r.title,
        channel: r.channel,
        duration: r.duration,
        thumbnail: r.thumbnail,
        viewCount: r.view_count,
      }));
      setSearchResults(tracks);
    } catch (e) {
      console.error("Lyra search failed:", e);
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery, setIsSearching, setSearchResults]);

  // ── Play a track ───────────────────────────────────────────────────────
  const playTrack = useCallback(
    async (track: LyraTrack, mode?: PlaybackMode) => {
      const targetMode = mode ?? playbackMode;
      setCurrentTrack(track);
      setPlaybackMode(targetMode);
      setIsLoadingStream(true);
      setIsPlaying(false);
      setStreamUrls(null, null);
      setCachedAudioPath(null);
      setCurrentTime(0);
      setDuration(track.duration);
      addToRecentlyPlayed(track);

      try {
        // Check audio cache first for music mode
        if (targetMode === "music") {
          const cached = await lyraCheckAudioCache(track.id);
          if (cached) {
            setCachedAudioPath(cached);
            setIsLoadingStream(false);
            setIsPlaying(true);
            return;
          }
        }

        // Get stream URL
        const info = await lyraGetStreamUrl(track.id);
        setStreamUrls(info.video_url, info.audio_url);
        setIsLoadingStream(false);
        setIsPlaying(true);

        // For music mode, start caching in background
        if (targetMode === "music" && !isCachingAudio) {
          setIsCachingAudio(true);
          lyraCacheAudio(track.id, track.title)
            .then((path) => {
              // Only set cached path if this track is still current
              const current = useLyraStore.getState().currentTrack;
              if (current?.id === track.id) {
                setCachedAudioPath(path);
              }
            })
            .catch(() => {})
            .finally(() => setIsCachingAudio(false));
        }
      } catch (e) {
        console.error("Failed to get stream URL:", e);
        setIsLoadingStream(false);
      }
    },
    [
      playbackMode, setCurrentTrack, setPlaybackMode, setIsLoadingStream,
      setIsPlaying, setStreamUrls, setCachedAudioPath, setCurrentTime,
      setDuration, addToRecentlyPlayed, isCachingAudio, setIsCachingAudio,
    ],
  );

  // ── Queue play ─────────────────────────────────────────────────────────
  const handlePlayFromQueue = useCallback(
    (index: number) => {
      const track = queue[index];
      if (track) {
        setQueueIndex(index);
        void playTrack(track);
      }
    },
    [queue, setQueueIndex, playTrack],
  );

  const handleAddToQueueAndPlay = useCallback(
    (track: LyraTrack) => {
      addToQueue(track);
      const newIndex = queue.length; // Will be the last item
      setQueueIndex(newIndex);
      void playTrack(track);
    },
    [addToQueue, queue.length, setQueueIndex, playTrack],
  );

  // ── Playback controls ─────────────────────────────────────────────────
  const handlePlayPause = useCallback(() => {
    setIsPlaying(!isPlaying);
  }, [isPlaying, setIsPlaying]);

  const handleNext = useCallback(() => {
    const next = playNext();
    if (next) void playTrack(next);
  }, [playNext, playTrack]);

  const handlePrev = useCallback(() => {
    const prev = playPrevious();
    if (prev) void playTrack(prev);
  }, [playPrevious, playTrack]);

  // Sync audio element with state
  useEffect(() => {
    const el = playbackMode === "video" ? videoRef.current : audioRef.current;
    if (!el) return;
    if (isPlaying) {
      el.play().catch(() => {});
    } else {
      el.pause();
    }
  }, [isPlaying, playbackMode, streamAudioUrl, streamVideoUrl, cachedAudioPath]);

  // Volume sync
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
    if (videoRef.current) videoRef.current.volume = volume;
  }, [volume]);

  // Track ended handler
  const handleEnded = useCallback(() => {
    if (repeat === "one") {
      const el = playbackMode === "video" ? videoRef.current : audioRef.current;
      if (el) {
        el.currentTime = 0;
        el.play().catch(() => {});
      }
    } else {
      const next = playNext();
      if (next) {
        void playTrack(next);
      } else {
        setIsPlaying(false);
      }
    }
  }, [repeat, playbackMode, playNext, playTrack, setIsPlaying]);

  // Time update handler
  const handleTimeUpdate = useCallback(() => {
    const el = playbackMode === "video" ? videoRef.current : audioRef.current;
    if (el) {
      setCurrentTime(el.currentTime);
      if (el.duration && !isNaN(el.duration)) {
        setDuration(el.duration);
      }
    }
  }, [playbackMode, setCurrentTime, setDuration]);

  // Seek handler
  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    const el = playbackMode === "video" ? videoRef.current : audioRef.current;
    if (el) {
      el.currentTime = time;
      setCurrentTime(time);
    }
  }, [playbackMode, setCurrentTime]);

  // Get current media source
  const audioSrc = cachedAudioPath
    ? `asset://localhost/${cachedAudioPath}`
    : streamAudioUrl;
  const videoSrc = streamVideoUrl;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="lyra-header">
        <div className="lyra-header-left">
          <button className="lyra-back-btn" onClick={goBack}>
            <ArrowLeft size={16} />
          </button>
          <div className="lyra-title-group">
            <Radio size={18} className="lyra-title-icon" />
            <h1 className="lyra-title">Lyra</h1>
            <span className="lyra-badge">Stream</span>
          </div>
        </div>
        <div className="lyra-header-right">
          <button
            className={`lyra-mode-btn ${playbackMode === "music" ? "lyra-mode-active" : ""}`}
            onClick={() => setPlaybackMode("music")}
          >
            <Music size={14} /> Music
          </button>
          <button
            className={`lyra-mode-btn ${playbackMode === "video" ? "lyra-mode-active" : ""}`}
            onClick={() => setPlaybackMode("video")}
          >
            <Video size={14} /> Video
          </button>
          <button
            className={`lyra-queue-toggle ${showQueue ? "lyra-queue-toggle-active" : ""}`}
            onClick={() => setShowQueue(!showQueue)}
          >
            <ListMusic size={14} />
            {queue.length > 0 && <span className="lyra-queue-count">{queue.length}</span>}
          </button>
        </div>
      </div>

      {/* ── yt-dlp warning ─────────────────────────────────────────────── */}
      {hasYtdlp === false && (
        <div className="lyra-ytdlp-warning">
          <span>Lyra requires yt-dlp for streaming. </span>
          <button
            className="lyra-ytdlp-install-btn"
            onClick={() => void handleInstallYtdlp()}
            disabled={isInstallingYtdlp}
          >
            {isInstallingYtdlp ? (
              <><Loader2 size={12} className="animate-spin" /> Installing…</>
            ) : (
              "Install yt-dlp"
            )}
          </button>
        </div>
      )}

      {/* ── Main content ───────────────────────────────────────────────── */}
      <div className="lyra-content">
        <div className="lyra-main">
          {/* Search bar */}
          <div className="lyra-search-bar">
            <Search size={16} className="lyra-search-icon" />
            <input
              ref={searchInputRef}
              className="lyra-search-input"
              placeholder="Search YouTube for music or videos…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleSearch();
              }}
            />
            {isSearching && <Loader2 size={16} className="animate-spin lyra-search-spinner" />}
          </div>

          {/* Video player (shown when in video mode and has a track) */}
          {playbackMode === "video" && currentTrack && (
            <div className="lyra-video-container">
              {isLoadingStream ? (
                <div className="lyra-video-loading">
                  <Loader2 size={32} className="animate-spin" />
                  <span>Loading stream…</span>
                </div>
              ) : videoSrc ? (
                <video
                  ref={videoRef}
                  className="lyra-video-player"
                  src={videoSrc}
                  onTimeUpdate={handleTimeUpdate}
                  onEnded={handleEnded}
                  onLoadedMetadata={() => {
                    if (videoRef.current) setDuration(videoRef.current.duration);
                  }}
                />
              ) : (
                <div className="lyra-video-loading">
                  <span>No video stream available</span>
                </div>
              )}
            </div>
          )}

          {/* Search results */}
          {searchResults.length > 0 && (
            <div className="lyra-results">
              <h3 className="lyra-results-title">Search Results</h3>
              <div className="lyra-results-grid">
                {searchResults.map((track) => (
                  <TrackCard
                    key={track.id}
                    track={track}
                    isActive={currentTrack?.id === track.id}
                    isPlaying={currentTrack?.id === track.id && isPlaying}
                    onPlay={() => handleAddToQueueAndPlay(track)}
                    onAddQueue={() => addToQueue(track)}
                    playbackMode={playbackMode}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Recently played */}
          {searchResults.length === 0 && recentlyPlayed.length > 0 && (
            <div className="lyra-results">
              <div className="lyra-results-header">
                <h3 className="lyra-results-title">
                  <Clock size={14} /> Recently Played
                </h3>
                <button
                  className="lyra-section-toggle"
                  onClick={() => setShowHistory(!showHistory)}
                >
                  {showHistory ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
              </div>
              {showHistory && (
                <div className="lyra-results-grid">
                  {recentlyPlayed.map((track) => (
                    <TrackCard
                      key={track.id}
                      track={track}
                      isActive={currentTrack?.id === track.id}
                      isPlaying={currentTrack?.id === track.id && isPlaying}
                      onPlay={() => handleAddToQueueAndPlay(track)}
                      onAddQueue={() => addToQueue(track)}
                      playbackMode={playbackMode}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Empty state */}
          {searchResults.length === 0 && recentlyPlayed.length === 0 && !currentTrack && (
            <div className="lyra-empty">
              <Radio size={48} className="lyra-empty-icon" />
              <h2 className="lyra-empty-title">Welcome to Lyra</h2>
              <p className="lyra-empty-desc">
                Search for music or videos to start streaming from YouTube.
                {playbackMode === "music" && " Music will be cached permanently for offline playback."}
              </p>
            </div>
          )}
        </div>

        {/* Queue sidebar */}
        <AnimatePresence>
          {showQueue && (
            <motion.div
              className="lyra-queue-panel"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2 }}
            >
              <div className="lyra-queue-header">
                <h3><ListMusic size={14} /> Queue ({queue.length})</h3>
                {queue.length > 0 && (
                  <button className="lyra-queue-clear" onClick={clearQueue}>
                    Clear
                  </button>
                )}
              </div>
              <div className="lyra-queue-list">
                {queue.length === 0 ? (
                  <p className="lyra-queue-empty">Queue is empty</p>
                ) : (
                  queue.map((track, i) => (
                    <div
                      key={`${track.id}-${i}`}
                      className={`lyra-queue-item ${i === queueIndex ? "lyra-queue-item-active" : ""}`}
                    >
                      <button
                        className="lyra-queue-item-play"
                        onClick={() => handlePlayFromQueue(i)}
                      >
                        {i === queueIndex && isPlaying ? (
                          <Disc3 size={12} className="animate-spin" />
                        ) : (
                          <Play size={12} />
                        )}
                      </button>
                      <div className="lyra-queue-item-info">
                        <span className="lyra-queue-item-title">{track.title}</span>
                        <span className="lyra-queue-item-channel">{track.channel}</span>
                      </div>
                      <button
                        className="lyra-queue-item-remove"
                        onClick={() => removeFromQueue(i)}
                      >
                        <X size={11} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Now Playing bar ────────────────────────────────────────────── */}
      {currentTrack && (
        <div className="lyra-player-bar">
          {/* Track info */}
          <div className="lyra-player-info">
            {currentTrack.thumbnail ? (
              <img
                src={currentTrack.thumbnail}
                alt=""
                className="lyra-player-thumb"
              />
            ) : (
              <div className="lyra-player-thumb-placeholder">
                <Music size={16} />
              </div>
            )}
            <div className="lyra-player-meta">
              <span className="lyra-player-title">{currentTrack.title}</span>
              <span className="lyra-player-channel">{currentTrack.channel}</span>
            </div>
            {isCachingAudio && (
              <span className="lyra-caching-indicator" title="Caching audio…">
                <HardDrive size={12} className="animate-pulse" />
              </span>
            )}
            {cachedAudioPath && (
              <span className="lyra-cached-indicator" title="Cached">
                <HardDrive size={12} />
              </span>
            )}
          </div>

          {/* Controls */}
          <div className="lyra-player-controls">
            <button
              className={`lyra-ctrl-btn ${shuffle ? "lyra-ctrl-active" : ""}`}
              onClick={toggleShuffle}
              title="Shuffle"
            >
              <Shuffle size={14} />
            </button>
            <button className="lyra-ctrl-btn" onClick={handlePrev} title="Previous">
              <SkipBack size={16} />
            </button>
            <button
              className="lyra-play-btn"
              onClick={handlePlayPause}
              disabled={isLoadingStream}
            >
              {isLoadingStream ? (
                <Loader2 size={18} className="animate-spin" />
              ) : isPlaying ? (
                <Pause size={18} />
              ) : (
                <Play size={18} />
              )}
            </button>
            <button className="lyra-ctrl-btn" onClick={handleNext} title="Next">
              <SkipForward size={16} />
            </button>
            <button
              className={`lyra-ctrl-btn ${repeat !== "off" ? "lyra-ctrl-active" : ""}`}
              onClick={cycleRepeat}
              title={`Repeat: ${repeat}`}
            >
              {repeat === "one" ? <Repeat1 size={14} /> : <Repeat size={14} />}
            </button>
          </div>

          {/* Seek bar + volume */}
          <div className="lyra-player-seek-row">
            <span className="lyra-time">{formatDuration(currentTime)}</span>
            <input
              type="range"
              className="lyra-seek-bar"
              min={0}
              max={duration || 0}
              step={0.5}
              value={currentTime}
              onChange={handleSeek}
            />
            <span className="lyra-time">{formatDuration(duration)}</span>
            <button
              className="lyra-ctrl-btn lyra-volume-btn"
              onClick={() => setVolume(volume > 0 ? 0 : 0.8)}
            >
              {volume === 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}
            </button>
            <input
              type="range"
              className="lyra-volume-slider"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
            />
          </div>
        </div>
      )}

      {/* Hidden audio element for music mode */}
      {playbackMode === "music" && audioSrc && (
        <audio
          ref={audioRef}
          src={audioSrc}
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleEnded}
          onLoadedMetadata={() => {
            if (audioRef.current) setDuration(audioRef.current.duration);
          }}
          style={{ display: "none" }}
        />
      )}
    </div>
  );
}

// ── Track Card ───────────────────────────────────────────────────────────────

function TrackCard({
  track,
  isActive,
  isPlaying,
  onPlay,
  onAddQueue,
  playbackMode,
}: {
  track: LyraTrack;
  isActive: boolean;
  isPlaying: boolean;
  onPlay: () => void;
  onAddQueue: () => void;
  playbackMode: PlaybackMode;
}) {
  return (
    <div className={`lyra-track-card ${isActive ? "lyra-track-active" : ""}`}>
      <div className="lyra-track-thumb-wrap" onClick={onPlay}>
        {track.thumbnail ? (
          <img src={track.thumbnail} alt="" className="lyra-track-thumb" loading="lazy" />
        ) : (
          <div className="lyra-track-thumb lyra-track-thumb-empty">
            <Music size={20} />
          </div>
        )}
        <div className="lyra-track-play-overlay">
          {isActive && isPlaying ? (
            <Pause size={20} />
          ) : (
            <Play size={20} />
          )}
        </div>
        <span className="lyra-track-duration">{formatDuration(track.duration)}</span>
      </div>
      <div className="lyra-track-info">
        <span className="lyra-track-title" title={track.title}>{track.title}</span>
        <span className="lyra-track-channel">{track.channel}</span>
        <div className="lyra-track-stats">
          {track.viewCount > 0 && (
            <span><Eye size={10} /> {formatViewCount(track.viewCount)}</span>
          )}
          <span className="lyra-track-mode-icon">
            {playbackMode === "music" ? <Music size={10} /> : <Video size={10} />}
          </span>
        </div>
      </div>
      <div className="lyra-track-actions">
        <button className="lyra-track-action-btn" onClick={onAddQueue} title="Add to queue">
          <Plus size={13} />
        </button>
      </div>
    </div>
  );
}
