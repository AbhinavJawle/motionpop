// Ports of the render job (spec 08 design §8). `runRender` only talks to these interfaces, so the
// same orchestration runs in the cloud (Firestore + Storage), against the emulators and offline
// (memory + filesystem), and tests drive it with fakes.
import type { compileProject } from '@motionpop/motion/compiler';
import type { VideoCompositeArgs } from './video-ffmpeg';
import type {
  RenderDoc,
  RenderErrorCode,
  RenderStatus,
  Resolution,
  Format,
} from '@motionpop/schemas';

/** The statuses the job itself writes progress in. */
export type JobStage = 'rendering' | 'encoding';

/** Result of a store write that depends on the render still being active. */
export type StoreWrite = 'ok' | 'inactive';

export interface RenderOutput {
  outputPath: string;
  thumbPath: string;
  sizeBytes: number;
}

/**
 * Every method is one transaction that re-reads the doc (design §6). A write on a doc that is
 * no longer active answers `inactive` and changes nothing; the job aborts when it sees that.
 */
export interface RenderStore {
  /** The render doc, parsed; null when it does not exist. */
  get(renderId: string): Promise<RenderDoc | null>;
  /** `queued → rendering`, sets `startedAt` and `heartbeatAt`. False when it was not queued. */
  markStarted(renderId: string): Promise<boolean>;
  /** Moves to `stage` if needed (`rendering → encoding`) and raises progress (never lowers it). */
  progress(renderId: string, stage: JobStage, progress: number): Promise<StoreWrite>;
  heartbeat(renderId: string): Promise<StoreWrite>;
  /** `encoding → done` with progress 100. */
  markDone(renderId: string, output: RenderOutput): Promise<StoreWrite>;
  /** Any active status → `error`, refunding the cost at most once. A no-op on a final render. */
  fail(renderId: string, code: RenderErrorCode, message: string): Promise<void>;
}

export interface UploadMeta {
  contentType: string;
  /** Full `Content-Disposition` value. */
  contentDisposition?: string;
  cacheControl?: string;
}

export class BlobNotFoundError extends Error {
  constructor(readonly path: string) {
    super(`object not found: ${path}`);
    this.name = 'BlobNotFoundError';
  }
}

export interface BlobStore {
  /** Throws `BlobNotFoundError` when the object does not exist. */
  read(path: string): Promise<Buffer>;
  /** Streams an object to a local file (voices can be 50 MB). Throws `BlobNotFoundError`. */
  download(path: string, destFile: string): Promise<void>;
  upload(path: string, srcFile: string, meta: UploadMeta): Promise<void>;
  /** Deletes every object whose path starts with `prefix`. Never throws for "nothing there". */
  deletePrefix(prefix: string): Promise<void>;
}

export interface SlotIssue {
  slotId: string;
  message: string;
}

export interface Preflight {
  /**
   * Loads the compiled composition in headless Chrome, seeks to each time (integer ms) and
   * returns the slot errors the runtime reported. Throws when the page cannot be loaded.
   */
  check(args: {
    compDir: string;
    format: Format;
    samplesMs: number[];
    signal: AbortSignal;
  }): Promise<SlotIssue[]>;
}

export class RenderTimeoutError extends Error {
  constructor(message = 'render timed out') {
    super(message);
    this.name = 'RenderTimeoutError';
  }
}

export class RenderAbortedError extends Error {
  constructor(message = 'render aborted') {
    super(message);
    this.name = 'RenderAbortedError';
  }
}

export interface ProducerProgress {
  stage: JobStage;
  /** The producer's own progress, 0–100 over the whole job. */
  percent: number;
}

export interface Producer {
  /**
   * Renders `compDir` to `outPath` (MP4, H.264, 30 fps). Throws `RenderTimeoutError` past the
   * time limit and `RenderAbortedError` when the signal fires; any other error is a failure.
   */
  render(args: {
    compDir: string;
    outPath: string;
    format: Format;
    resolution: Resolution;
    /** Output container (`webm` carries alpha for video-overlay compositing; default `mp4`). */
    container?: 'mp4' | 'webm';
    signal: AbortSignal;
    onProgress: (p: ProducerProgress) => void;
  }): Promise<{ perf?: Record<string, unknown> }>;
}

export interface MediaProbe {
  durationMs: number;
  audioStreams: number;
  videoStreams: number;
  /** Video stream size and frame count; absent when there is no video stream. */
  width?: number;
  height?: number;
  frames?: number;
}

export interface Ffmpeg {
  /** `ffprobe` with its JSON parsed and validated. Throws when the file is not media. */
  probe(file: string, opts?: { countFrames?: boolean; inputFormat?: string }): Promise<MediaProbe>;
  /**
   * First audio stream only, PCM WAV, 48 kHz stereo (`-map 0:a:0 -vn -sn -dn`), cut at `maxMs`
   * so a small upload cannot expand into an enormous file. `inputFormat` forces the demuxer
   * (`-f`), which keeps playlists and `concat` files from pulling in other files.
   */
  toWav(src: string, destWav: string, opts: { maxMs: number; inputFormat?: string }): Promise<void>;
  /** One JPEG frame at `atMs`, `longSide` px on the long side. */
  frame(args: { video: string; atMs: number; destJpg: string; longSide: number }): Promise<void>;
  /** Cut/zoom source video, composite transparent graphics overlay, and mux audio into MP4 (spec 18). */
  compositeVideo?(args: VideoCompositeArgs): Promise<void>;
}

export type CompileAssets = Parameters<typeof compileProject>[1];

export interface Clock {
  now(): number;
  /** Calls `fn` every `ms` until the returned function runs. Service code, not compositions. */
  every(ms: number, fn: () => void): () => void;
}

export interface Logger {
  info(fields: Record<string, unknown>): void;
  error(fields: Record<string, unknown>): void;
}

export interface RenderDeps {
  store: RenderStore;
  blobs: BlobStore;
  preflight: Preflight;
  producer: Producer;
  ffmpeg: Ffmpeg;
  assets: CompileAssets;
  clock: Clock;
  /** A folder this render owns; deleted when it ends (`os.tmpdir()/render-{id}`). */
  workDir: string;
  log: Logger;
}

export type RenderOutcome = 'done' | 'error' | 'skipped';

export type { RenderStatus };
