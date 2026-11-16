import { OUTPUT_SAMPLE_RATE } from './decode';
import { FRAME_MS, type LevelFrame } from './level';
import { RECORDER_WORKLET } from './recorder.worklet';
import { encodeWav } from './wav';

/** The longest take (R8.6). */
export const MAX_TAKE_MS = 10 * 60_000;

export type RecorderError = 'denied' | 'no-device' | 'unsupported';

export class RecorderStartError extends Error {
  constructor(
    readonly reason: RecorderError,
    cause?: unknown,
  ) {
    super(reason, { cause });
  }
}

/**
 * In-browser capture (spec 11 R8, design §6). PCM through an AudioWorklet, kept as chunks on
 * the main thread; pause drops chunks, so the timer (from the captured sample count) never
 * drifts. `stop()` gives a 24 kHz mono 16-bit WAV (D-065 #6).
 */
export class Recorder {
  private ctx: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private stream: MediaStream | null = null;
  private chunks: Float32Array[] = [];
  private samples = 0;
  private paused = false;
  private frameAcc = { peak: 0, sq: 0, n: 0 };
  private readonly frameFns = new Set<(f: LevelFrame) => void>();
  private readonly endedFns = new Set<() => void>();

  get durationMs(): number {
    return this.ctx ? Math.round((this.samples / this.ctx.sampleRate) * 1000) : 0;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  /** The label of the live input, when the browser shares it. */
  get deviceId(): string | undefined {
    return this.stream?.getAudioTracks()[0]?.getSettings().deviceId;
  }

  async start(deviceId?: string): Promise<void> {
    if (typeof AudioWorkletNode === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      throw new RecorderStartError('unsupported');
    }
    const stream = await this.open(deviceId);
    // A 24 kHz context lets Chrome resample at the source; `stop()` resamples otherwise.
    let ctx: AudioContext;
    try {
      ctx = new AudioContext({ sampleRate: OUTPUT_SAMPLE_RATE });
    } catch {
      ctx = new AudioContext();
    }
    const url = URL.createObjectURL(new Blob([RECORDER_WORKLET], { type: 'text/javascript' }));
    try {
      await ctx.audioWorklet.addModule(url);
    } finally {
      URL.revokeObjectURL(url);
    }
    const node = new AudioWorkletNode(ctx, 'mp-recorder');
    node.port.onmessage = (e: MessageEvent<Float32Array>) => this.take(e.data);
    // A silent sink keeps the graph pulling without playing the mic back.
    const sink = ctx.createGain();
    sink.gain.value = 0;
    node.connect(sink).connect(ctx.destination);
    this.ctx = ctx;
    this.node = node;
    this.attach(stream);
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  /** Continues the same take on another microphone (R8.3). */
  async switchDevice(deviceId: string): Promise<void> {
    const stream = await this.open(deviceId);
    this.detach();
    this.attach(stream);
  }

  onFrame(fn: (f: LevelFrame) => void): () => void {
    this.frameFns.add(fn);
    return () => this.frameFns.delete(fn);
  }

  /** The input stopped (mic unplugged or permission revoked). */
  onEnded(fn: () => void): () => void {
    this.endedFns.add(fn);
    return () => this.endedFns.delete(fn);
  }

  async stop(): Promise<{ wav: Blob; durationMs: number }> {
    const rate = this.ctx?.sampleRate ?? OUTPUT_SAMPLE_RATE;
    const durationMs = this.durationMs;
    const pcm = new Float32Array(this.samples);
    let o = 0;
    for (const c of this.chunks) {
      pcm.set(c, o);
      o += c.length;
    }
    this.dispose();
    const out = rate === OUTPUT_SAMPLE_RATE ? pcm : await resample(pcm, rate, OUTPUT_SAMPLE_RATE);
    return {
      wav: new Blob([encodeWav(out, OUTPUT_SAMPLE_RATE)], { type: 'audio/wav' }),
      durationMs,
    };
  }

  dispose(): void {
    this.detach();
    this.node?.port.close();
    this.node?.disconnect();
    void this.ctx?.close().catch(() => undefined);
    this.node = null;
    this.ctx = null;
    this.chunks = [];
    this.samples = 0;
  }

  private async open(deviceId?: string): Promise<MediaStream> {
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: {
          ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
    } catch (e) {
      const name = e instanceof DOMException ? e.name : '';
      if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        throw new RecorderStartError('no-device', e);
      }
      throw new RecorderStartError('denied', e);
    }
  }

  private attach(stream: MediaStream): void {
    if (!this.ctx || !this.node) return;
    this.stream = stream;
    this.source = this.ctx.createMediaStreamSource(stream);
    this.source.connect(this.node);
    for (const t of stream.getAudioTracks()) {
      t.addEventListener('ended', () => {
        if (this.stream === stream) this.endedFns.forEach((fn) => fn());
      });
    }
  }

  private detach(): void {
    this.source?.disconnect();
    this.source = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }

  private take(chunk: Float32Array): void {
    if (this.paused || !this.ctx) return;
    const rate = this.ctx.sampleRate;
    const room = Math.floor((MAX_TAKE_MS / 1000) * rate) - this.samples;
    if (room <= 0) return;
    const c = chunk.length > room ? chunk.subarray(0, room) : chunk;
    this.chunks.push(c);
    this.samples += c.length;
    // 50 ms level frames from the kept samples.
    const per = Math.round((FRAME_MS / 1000) * rate);
    const acc = this.frameAcc;
    for (let i = 0; i < c.length; i++) {
      const v = c[i] ?? 0;
      const a = Math.abs(v);
      if (a > acc.peak) acc.peak = a;
      acc.sq += v * v;
      acc.n++;
      if (acc.n >= per) {
        const f: LevelFrame = {
          peak: acc.peak,
          rms: Math.sqrt(acc.sq / acc.n),
          tMs: Math.round(((this.samples - c.length + i + 1) / rate) * 1000),
        };
        this.frameFns.forEach((fn) => fn(f));
        acc.peak = 0;
        acc.sq = 0;
        acc.n = 0;
      }
    }
  }
}

async function resample(
  pcm: Float32Array<ArrayBuffer>,
  from: number,
  to: number,
): Promise<Float32Array> {
  const length = Math.max(1, Math.round((pcm.length * to) / from));
  const off = new OfflineAudioContext(1, length, to);
  const buf = off.createBuffer(1, Math.max(1, pcm.length), from);
  buf.copyToChannel(pcm.length ? pcm : new Float32Array(1), 0);
  const src = off.createBufferSource();
  src.buffer = buf;
  src.connect(off.destination);
  src.start();
  return (await off.startRendering()).getChannelData(0);
}
