import type { EditorStore } from '../stores/editor';
import { seekPreview } from './preview-bridge';

/**
 * Editor playback (spec 04 R5). The voiceover <audio> element is the master clock while
 * playing; every animation frame we read it once and notify subscribers (playhead CSS
 * variable, timecode, karaoke, preview seek). Nothing here sets React state per frame:
 * the store's `playheadMs` only changes on pause, seek and scrub end.
 *
 * Without decodable audio (or when autoplay is blocked) the clock falls back to
 * `performance.now()` deltas. That fallback lives in the UI clock only, never in compositions.
 */

export type FrameListener = (ms: number) => void;

export class PlaybackClock {
  private audio: HTMLAudioElement | null = null;
  private listeners = new Set<FrameListener>();
  private raf = 0;
  private ms = 0;
  private playing = false;
  private fallbackFrom: { wall: number; ms: number } | null = null;
  private rate = 1;

  constructor(
    private readonly store: EditorStore,
    private readonly env: {
      now: () => number;
      requestFrame: (cb: () => void) => number;
      cancelFrame: (id: number) => void;
    } = {
      now: () => performance.now(),
      requestFrame: (cb) => requestAnimationFrame(cb),
      cancelFrame: (id) => cancelAnimationFrame(id),
    },
  ) {}

  attachAudio(audio: HTMLAudioElement | null): void {
    this.audio?.removeEventListener('ended', this.onEnded);
    this.audio = audio;
    audio?.addEventListener('ended', this.onEnded);
    if (audio) audio.currentTime = this.ms / 1000;
  }

  subscribe(listener: FrameListener): () => void {
    this.listeners.add(listener);
    listener(this.ms);
    return () => this.listeners.delete(listener);
  }

  get currentMs(): number {
    return this.ms;
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  private get durationMs(): number {
    return this.store.getState().project?.durationMs ?? 0;
  }

  private emit(ms: number): void {
    this.ms = ms;
    seekPreview(ms);
    for (const l of this.listeners) l(ms);
  }

  /** Moves the playhead (click, scrub, keys). Commits to the store unless `transient`. */
  seek(ms: number, opts: { transient?: boolean } = {}): void {
    const t = Math.max(0, Math.min(this.durationMs, Math.round(ms)));
    if (this.audio) this.audio.currentTime = t / 1000;
    if (this.fallbackFrom) this.fallbackFrom = { wall: this.env.now(), ms: t };
    this.emit(t);
    if (!opts.transient) this.store.getState().setPlayhead(t);
  }

  async play(rate = 1): Promise<void> {
    if (this.playing) {
      // Already running (e.g. L pressed again): change speed on the same frame loop.
      if (rate === this.rate) return;
      this.rate = rate;
      if (this.audio) this.audio.playbackRate = rate;
      if (this.fallbackFrom) this.fallbackFrom = { wall: this.env.now(), ms: this.ms };
      return;
    }
    if (this.ms >= this.durationMs) this.seek(0, { transient: true });
    this.rate = rate;
    this.playing = true;
    this.store.getState().setPlaying(true);
    this.fallbackFrom = null;
    if (this.audio) {
      this.audio.playbackRate = rate;
      try {
        await this.audio.play();
      } catch {
        this.fallbackFrom = { wall: this.env.now(), ms: this.ms };
      }
    } else {
      this.fallbackFrom = { wall: this.env.now(), ms: this.ms };
    }
    if (this.playing) this.loop();
  }

  pause(): void {
    if (!this.playing) return;
    this.playing = false;
    this.env.cancelFrame(this.raf);
    this.audio?.pause();
    this.fallbackFrom = null;
    const s = this.store.getState();
    s.setPlaying(false);
    s.setPlayhead(this.ms);
  }

  toggle(): void {
    if (this.playing) this.pause();
    else void this.play();
  }

  private loop = (): void => {
    if (!this.playing) return;
    const ms = this.fallbackFrom
      ? this.fallbackFrom.ms + (this.env.now() - this.fallbackFrom.wall) * this.rate
      : (this.audio?.currentTime ?? 0) * 1000;
    if (ms >= this.durationMs) {
      this.emit(this.durationMs);
      this.pause();
      return;
    }
    this.emit(Math.round(ms));
    this.raf = this.env.requestFrame(this.loop);
  };

  private onEnded = (): void => {
    this.emit(this.durationMs);
    this.pause();
  };

  dispose(): void {
    this.pause();
    this.attachAudio(null);
    this.listeners.clear();
  }
}
