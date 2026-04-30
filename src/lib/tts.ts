import { speakTts } from "./tauri";
import { TTS_SAMPLE_RATE } from "./tts-voices";

// ── Phrase Detection ─────────────────────────────────────────────────────────

interface PhraseBoundary {
  phrase: string;
  remaining: string;
}

/**
 * Detect a complete phrase boundary in buffered text.
 *
 * Looks for sentence terminators (. ! ?) followed by whitespace
 * or end-of-string, then falls back to clause breaks, then hard-caps
 * at 5 words for responsive pipelining.
 */
export function detectPhraseBoundary(text: string): PhraseBoundary | null {
  if (!text.trim()) return null;

  // Sentence terminators — including at end of string
  const sentenceMatch = text.match(/[.!?…]["')\]]*(?:\s+|$)/);
  if (sentenceMatch && sentenceMatch.index !== undefined) {
    const end = sentenceMatch.index + sentenceMatch[0].length;
    return { phrase: text.slice(0, end).trim(), remaining: text.slice(end) };
  }

  // Clause breaks (comma, semicolon, colon, em-dash)
  const clauseMatch = text.match(/[,;:—]\s+/);
  if (clauseMatch && clauseMatch.index !== undefined) {
    const end = clauseMatch.index + clauseMatch[0].length;
    return { phrase: text.slice(0, end).trim(), remaining: text.slice(end) };
  }

  // Hard cap: 5 words (shorter = faster synthesis = better pipelining)
  const words = text.split(/\s+/);
  if (words.length >= 5) {
    return {
      phrase: words.slice(0, 5).join(" "),
      remaining: words.slice(5).join(" "),
    };
  }

  // Newline break
  const newlineIdx = text.indexOf("\n");
  if (newlineIdx > 0) {
    return {
      phrase: text.slice(0, newlineIdx).trim(),
      remaining: text.slice(newlineIdx + 1),
    };
  }

  return null;
}

// ── Queue Entry ──────────────────────────────────────────────────────────────

interface QueueEntry {
  audioBuffer: AudioBuffer;
  text: string;
  charOffset: number;
}

interface PendingSynthesis {
  seq: number;
  text: string;
  charOffset: number;
  audioBuffer: AudioBuffer | null;
}

// ── TTS Manager ──────────────────────────────────────────────────────────────

export class TTSManager {
  private audioCtx: AudioContext | null = null;
  private queue: QueueEntry[] = [];
  private isPlaying = false;
  private currentSource: AudioBufferSourceNode | null = null;
  private cancelled = false;

  // Phrase buffer for streaming input
  private phraseBuffer = "";
  private revealedChars = 0;
  private totalCharsSpoken = 0;

  // Ordered synthesis tracking
  private nextSeq = 0;
  private lastQueuedSeq = -1;
  private pendingSyntheses = new Map<number, PendingSynthesis>();
  private pendingCount = 0;

  // Callbacks
  private _onReveal: ((totalRevealed: number) => void) | null = null;
  private _onAllDone: (() => void) | null = null;
  private _onSpeaking: ((speaking: boolean) => void) | null = null;
  private _onError: ((err: Error) => void) | null = null;

  // Animation
  private animFrameId: number | null = null;

  // Flush timer: if text sits in the buffer too long without a boundary,
  // force-extract it so synthesis can keep ahead of playback.
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly FLUSH_DELAY_MS = 250;

  // Settings
  private voice = "af_heart";
  private speed = 1.0;

  // ── Public API ─────────────────────────────────────────────────────────

  setVoice(voice: string): void {
    this.voice = voice;
  }

  setSpeed(speed: number): void {
    this.speed = speed;
  }

  onReveal(cb: (totalRevealed: number) => void): void {
    this._onReveal = cb;
  }

  onAllDone(cb: () => void): void {
    this._onAllDone = cb;
  }

  onSpeaking(cb: (speaking: boolean) => void): void {
    this._onSpeaking = cb;
  }

  onError(cb: (err: Error) => void): void {
    this._onError = cb;
  }

  /** Feed a streaming text chunk into the phrase buffer. */
  feedChunk(chunk: string): void {
    if (this.cancelled) return;
    this.phraseBuffer += chunk;
    this.tryExtractPhrase();
    this.scheduleFlush();
  }

  /**
   * Flush remaining buffered text (called when the stream ends).
   * Speaks whatever is left in the buffer even if no boundary was detected.
   */
  async flush(): Promise<void> {
    if (this.cancelled) return;
    this.clearFlushTimer();
    const remaining = this.phraseBuffer.trim();
    if (remaining) {
      this.phraseBuffer = "";
      void this.synthesiseAndQueue(remaining);
    }
  }

  /** Cancel all audio, clear queues, reset state. Keeps AudioContext alive. */
  cancel(): void {
    this.cancelled = true;
    this.clearFlushTimer();

    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    if (this.currentSource) {
      try {
        this.currentSource.stop();
      } catch {
        /* already stopped */
      }
      this.currentSource = null;
    }

    this.queue = [];
    this.isPlaying = false;
    this.pendingCount = 0;
    this.pendingSyntheses.clear();
    this.nextSeq = 0;
    this.lastQueuedSeq = -1;

    // Reveal all text that was fed so far
    this.revealedChars = this.totalCharsSpoken + this.phraseBuffer.length;
    this._onReveal?.(this.revealedChars);
    this._onAllDone?.();

    this.revealedChars = 0;
    this.totalCharsSpoken = 0;
    this.phraseBuffer = "";
    this._onSpeaking?.(false);
  }

  private scheduleFlush(): void {
    this.clearFlushTimer();
    if (!this.phraseBuffer.trim()) return;
    this.flushTimer = setTimeout(() => {
      if (this.cancelled) return;
      this.tryExtractPhrase();
      if (this.phraseBuffer.trim()) {
        this.scheduleFlush();
      }
    }, this.FLUSH_DELAY_MS);
  }

  private clearFlushTimer(): void {
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /** Fully dispose of the TTS manager including AudioContext. */
  dispose(): void {
    this.cancel();
    if (this.audioCtx) {
      void this.audioCtx.close();
      this.audioCtx = null;
    }
  }

  /** Reset for a new message (preserves settings). */
  reset(): void {
    this.cancel();
    this.cancelled = false;
  }

  /** Get the total number of characters that have been revealed so far. */
  getRevealedChars(): number {
    return this.revealedChars;
  }

  // ── Internal: Phrase Extraction ────────────────────────────────────────

  private tryExtractPhrase(): void {
    if (this.cancelled) return;

    const result = detectPhraseBoundary(this.phraseBuffer);
    if (!result) return;

    this.phraseBuffer = result.remaining;
    const phrase = result.phrase;
    const charOffset = this.totalCharsSpoken;
    this.totalCharsSpoken += phrase.length;

    void this.synthesiseAndQueue(phrase, charOffset);

    if (this.phraseBuffer.trim()) {
      this.tryExtractPhrase();
    }
  }

  // ── Internal: Ordered Synthesis ────────────────────────────────────────

  private async synthesiseAndQueue(
    text: string,
    charOffset?: number,
  ): Promise<void> {
    if (this.cancelled) return;

    const seq = this.nextSeq++;
    const offset = charOffset ?? this.revealedChars;
    this.pendingCount++;

    // Register as pending before starting async work
    this.pendingSyntheses.set(seq, { seq, text, charOffset: offset, audioBuffer: null });

    try {
      const wavBase64 = await speakTts(text, this.voice, this.speed);
      if (this.cancelled) return;
      const audioBuffer = await this.decodeBase64Wav(wavBase64);
      if (this.cancelled) return;

      const pending = this.pendingSyntheses.get(seq);
      if (!pending) return;
      pending.audioBuffer = audioBuffer;
      this.tryQueueInOrder();
    } catch (e) {
      console.error("[TTS] synthesis failed:", e);
      this.pendingSyntheses.delete(seq);
      this._onError?.(e instanceof Error ? e : new Error(String(e)));
      // Reveal the text for this failed phrase
      this.revealedChars = Math.max(this.revealedChars, offset + text.length);
      this._onReveal?.(this.revealedChars);
      this.tryQueueInOrder(); // unblock queue in case earlier seq failed
    } finally {
      this.pendingCount--;
    }
  }

  /**
   * Push completed syntheses to the playback queue in strict sequence order.
   * This ensures audio always plays in the order text was received, even if
   * shorter phrases finish synthesis before longer earlier phrases.
   */
  private tryQueueInOrder(): void {
    while (true) {
      const nextSeq = this.lastQueuedSeq + 1;
      const pending = this.pendingSyntheses.get(nextSeq);
      if (!pending || !pending.audioBuffer) break;

      this.queue.push({
        audioBuffer: pending.audioBuffer,
        text: pending.text,
        charOffset: pending.charOffset,
      });

      this.pendingSyntheses.delete(nextSeq);
      this.lastQueuedSeq = nextSeq;
    }

    if (!this.isPlaying) {
      this.playNext();
    }
  }

  // ── Internal: Audio Decoding ───────────────────────────────────────────

  private async decodeBase64Wav(base64: string): Promise<AudioBuffer> {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    const ctx = this.getAudioContext();
    return ctx.decodeAudioData(bytes.buffer.slice(0, bytes.length));
  }

  private getAudioContext(): AudioContext {
    if (!this.audioCtx) {
      this.audioCtx = new AudioContext({ sampleRate: TTS_SAMPLE_RATE });
    }
    return this.audioCtx;
  }

  // ── Internal: Playback + Text Sync ─────────────────────────────────────

  private async playNext(): Promise<void> {
    if (this.cancelled || this.queue.length === 0) {
      this.isPlaying = false;
      this._onSpeaking?.(false);

      // Check if all pending synthesis is done and queue is empty
      if (this.pendingCount === 0 && this.queue.length === 0) {
        this._onAllDone?.();
      }
      return;
    }

    this.isPlaying = true;
    this._onSpeaking?.(true);

    const entry = this.queue.shift()!;
    const ctx = this.getAudioContext();

    // Resume AudioContext if suspended (browser autoplay policy)
    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        /* ignore */
      }
    }

    const source = ctx.createBufferSource();
    source.buffer = entry.audioBuffer;
    source.connect(ctx.destination);
    this.currentSource = source;

    const duration = entry.audioBuffer.duration;
    const phraseLen = entry.text.length;

    // Start reveal animation
    this.animateReveal(entry.charOffset, phraseLen, duration);

    source.onended = () => {
      this.currentSource = null;
      // Fast-forward reveal to end of this phrase
      this.revealedChars = entry.charOffset + phraseLen;
      this._onReveal?.(this.revealedChars);

      if (this.animFrameId !== null) {
        cancelAnimationFrame(this.animFrameId);
        this.animFrameId = null;
      }

      this.playNext();
    };

    source.start(0);
  }

  /**
   * Smoothly reveal characters over the audio duration using requestAnimationFrame.
   * Characters appear at a rate matching the speech speed.
   */
  private animateReveal(
    startOffset: number,
    phraseLen: number,
    durationSec: number,
  ): void {
    if (this.cancelled) return;

    const startTime = performance.now();
    const totalMs = durationSec * 1000;

    const tick = (now: number) => {
      if (this.cancelled) return;

      const elapsed = now - startTime;
      const progress = Math.min(elapsed / totalMs, 1);
      const charsToShow = Math.floor(progress * phraseLen);

      this.revealedChars = startOffset + charsToShow;
      this._onReveal?.(this.revealedChars);

      if (progress < 1) {
        this.animFrameId = requestAnimationFrame(tick);
      }
    };

    this.animFrameId = requestAnimationFrame(tick);
  }
}
