import { speakTts } from "./tauri";
import { TTS_SAMPLE_RATE } from "./tts-voices";

// ── Markdown Stripping ───────────────────────────────────────────────────────

function stripMarkdown(text: string): string {
  let out = text
    // Fenced code blocks — remove entirely (including content)
    .replace(/```[\s\S]*?```/g, "")
    .replace(/~~~[\s\S]*?~~~/g, "")
    // Inline code
    .replace(/`(.+?)`/g, "$1")
    // Bold, italic, bold-italic
    .replace(/\*\*\*(.+?)\*\*\*/g, "$1")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/___(.+?)___/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/_(.+?)_/g, "$1")
    // Strikethrough
    .replace(/~~(.+?)~~/g, "$1")
    // Links — keep text, discard URL
    .replace(/\[(.+?)\]\(.+?\)/g, "$1")
    // Headings
    .replace(/^#{1,6}\s+/gm, "")
    // List markers
    .replace(/^[-*+]\s+/gm, "")
    .replace(/^(\d+)\.\s+/gm, "")
    // Blockquotes
    .replace(/^>\s+/gm, "")
    // Table formatting
    .replace(/\|/g, " ")
    .replace(/\s*---+\s*/g, " ")
    // Line breaks and HTML
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    // Collapse multi-newlines
    .replace(/\n{3,}/g, "\n\n")
    // Remove stray backticks and remaining formatting chars
    .replace(/`/g, "")
    .replace(/[*_~]/g, "")
    // Ellipsis normalisation
    .replace(/\.{3,}/g, "\u2026");

  // Only keep sentence-level punctuation and commas
  out = out.replace(/[^\w\s,.!?;:'\u2026-]/g, "");
  out = out.trim();

  return out;
}

// ── TTS Manager ──────────────────────────────────────────────────────────────
//
// Single-shot design: the entire message is synthesised in one call, producing
// one AudioBuffer. Text reveals smoothly over the full audio duration.
// This avoids per-phrase espeak-ng spawns, serialised ONNX runs, and base64
// roundtrips — all of which were the primary latency bottlenecks.

export class TTSManager {
  private audioCtx: AudioContext | null = null;
  private currentSource: AudioBufferSourceNode | null = null;
  private cancelled = false;
  private animFrameId: number | null = null;

  // Text accumulation during streaming
  private textBuffer = "";

  // Callbacks
  private _onReveal: ((totalRevealed: number) => void) | null = null;
  private _onAllDone: (() => void) | null = null;
  private _onError: ((err: Error) => void) | null = null;

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

  onError(cb: (err: Error) => void): void {
    this._onError = cb;
  }

  /**
   * Set the current accumulated text. Called with the full stripped text
   * on each streaming chunk so the manager always has the latest content.
   */
  feedChunk(fullStrippedText: string): void {
    if (this.cancelled) return;
    this.textBuffer = fullStrippedText;
  }

  /**
   * Synthesise the entire accumulated text in one call, then start playback
   * with progressive text reveal. This is the single point where all backend
   * work happens (1 espeak-ng spawn + 1 ONNX inference + 1 WAV encode).
   */
  async finalize(): Promise<void> {
    if (this.cancelled) return;
    const fullText = this.textBuffer.trim();
    if (!fullText) return;

    const speakText = stripMarkdown(fullText);
    let audioBuffer: AudioBuffer;
    try {
      const wavBytes = await speakTts(speakText, this.voice, this.speed);
      if (this.cancelled) return;
      const ctx = this.getAudioContext();
      audioBuffer = await ctx.decodeAudioData(wavBytes);
      if (this.cancelled) return;
    } catch (e) {
      console.error("[TTS] synthesis failed:", e);
      this._onError?.(e instanceof Error ? e : new Error(String(e)));
      return;
    }

    this.playSingle(audioBuffer, fullText);
  }

  /** Cancel audio and clear accumulated text. */
  cancel(): void {
    this.cancelled = true;

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

    this.textBuffer = "";
  }

  /** Fully dispose, including AudioContext. */
  dispose(): void {
    this.cancel();
    if (this.audioCtx) {
      void this.audioCtx.close();
      this.audioCtx = null;
    }
  }

  // ── Internal ────────────────────────────────────────────────────────────

  private getAudioContext(): AudioContext {
    if (!this.audioCtx) {
      this.audioCtx = new AudioContext({ sampleRate: TTS_SAMPLE_RATE });
    }
    return this.audioCtx;
  }

  private playSingle(buffer: AudioBuffer, text: string): void {
    if (this.cancelled) return;

    const ctx = this.getAudioContext();

    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    this.currentSource = source;

    const duration = buffer.duration;
    const totalChars = text.length;

    this.animateReveal(totalChars, duration);

    source.onended = () => {
      this.currentSource = null;
      if (this.animFrameId !== null) {
        cancelAnimationFrame(this.animFrameId);
        this.animFrameId = null;
      }
      this._onReveal?.(totalChars);
      this._onAllDone?.();
    };

    source.start(0);
  }

  private animateReveal(totalChars: number, durationSec: number): void {
    if (this.cancelled) return;
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
    }

    const startTime = performance.now();
    const totalMs = durationSec * 1000;

    const tick = (now: number) => {
      if (this.cancelled) return;

      const elapsed = now - startTime;
      const progress = Math.min(elapsed / totalMs, 1);
      const charsToShow = Math.floor(progress * totalChars);

      this._onReveal?.(charsToShow);

      if (progress < 1) {
        this.animFrameId = requestAnimationFrame(tick);
      } else {
        this.animFrameId = null;
        this._onReveal?.(totalChars);
      }
    };

    this.animFrameId = requestAnimationFrame(tick);
  }
}
