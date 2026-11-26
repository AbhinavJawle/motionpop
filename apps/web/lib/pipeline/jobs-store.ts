import { builtInSkills, styleFor, TTS_VOICES, type TtsVoiceId } from '@motionpop/ai';
import {
  APP_CONFIG_DEFAULTS,
  type AppConfig,
  type EditConfig,
  type Format,
  type MediaClipKind,
  type PendingExtraClip,
  type PendingIntake,
  type StartDraft,
} from '@motionpop/schemas';
import { create } from 'zustand';
import type { CreditsClient } from '../credits/client';
import { appAudioStore } from '../audio/app-audio-store';
import { checkDuration, validateIntake } from '../audio/intake';
import { isSilent, type DecodedAudio } from '../audio/decode';
import { START_COPY } from '../dashboard/copy';
import { clearPending, peekPending, updatePendingMeta } from '../intake/pending';
import { generateVoice } from '../tts/generate-voice';
import { withWhisper, type WhisperPriority } from '../transcribe/whisper-lock';
import type { VideoProbeResult } from '../video/frames';
import { guessMimeType, isSupportedMediaBinFile } from '../video/media-bin';
import { etaMs, jobProgress, STEP_WEIGHTS, type JobKind } from './eta';
import type { PipelineEvent } from './events';
import { initialProcessing, reduceProcessing, type ProcessingState } from './processing-state';
import { sampleWords } from './sample';
import {
  runPipeline,
  type PipelineDeps,
  type PipelineInput,
  type PipelineReuse,
  type TranscribeOutput,
} from './run';

/**
 * Background jobs (spec 39 R6, design §6). A job is born on the configure screen (`prepare`),
 * where free local work starts at once (keep, decode, probe, transcribe on device). `submit` queues
 * it; jobs run one at a time, outside any React tree, so moving around the app never stops them.
 * Only `cancel` aborts. Blobs, decoded audio and controllers live in a module map, not in the
 * store (not serialisable, not rendered).
 */

export type JobStatus = 'preparing' | 'queued' | 'running' | 'done' | 'error' | 'cancelled';
export type PrepStage = 'reading' | 'probing' | 'transcribing' | 'ready' | 'failed';

export interface JobMedia {
  name: string;
  mimeType: string;
  sizeBytes: number;
  durationMs?: number;
  width?: number;
  height?: number;
  /** A JPEG data URL of the first keyframe (video only). */
  thumbUrl?: string;
}

export interface JobExtraClip {
  ref: string;
  name: string;
  mimeType: string;
  sizeBytes?: number;
  kindHint?: MediaClipKind;
  durationMs?: number;
  width?: number;
  height?: number;
  /** JPEG data URL thumbnail for the Configure clip tray (spec 48). */
  thumbUrl?: string;
}

export interface Job {
  id: string;
  title: string;
  kind: JobKind;
  source: PendingIntake['source'];
  media: JobMedia;
  /** Secondary B-roll, screen recordings, or screenshots attached on Start / Configure (spec 48). */
  extraClips?: JobExtraClip[];
  /** The script, for a script job (shown instead of media). */
  script?: string;
  /** The prompt, for a standalone motion graphic job. */
  graphicPrompt?: string;
  /** Prepared plain-text transcript (from script, prompt, sample, or local Whisper) for auto-picking setup. */
  transcriptText?: string;
  /** Target aspect ratio (16:9, 9:16, 1:1) editable on Configure for graphic/voiceover jobs. */
  format?: Format;
  recipeLabel?: string;
  styleLabel?: string;
  status: JobStatus;
  /** `model`: the speech model's first download, 0–100 (only while it downloads). */
  prep: { pct: number; stage: PrepStage; error?: string; model?: number };
  processing: ProcessingState;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  progressPct: number;
  etaMs: number | null;
  projectId?: string;
  error?: string;
  /** The failure was the file itself: the only way on is another file. */
  intakeError?: boolean;
}

/** What a job needs from the app, registered by `<JobsHost/>` (review fix #8). */
export interface JobDeps {
  pipeline: PipelineDeps;
  credits: CreditsClient | null;
  config: AppConfig;
  uid: string | null;
}

export interface PendingTake {
  blob: Blob | null;
  meta: PendingIntake;
  draft: StartDraft;
}

interface Runtime {
  abort: AbortController;
  take: PendingTake;
  audio?: Promise<DecodedAudio>;
  probe?: Promise<VideoProbeResult | null>;
  transcript?: Promise<TranscribeOutput>;
  transcriptReady: boolean;
  /** Last Whisper progress, forwarded to a job that waits on the prep's transcription. */
  lastProgress?: WhisperProgress;
  progressListeners: Set<(p: WhisperProgress) => void>;
  priority: WhisperPriority;
  edit?: EditConfig;
  uid?: string | null;
  voice?: File;
  /**
   * What this job already paid for, kept as it arrives so Retry never pays twice (spec 39 design
   * §10 #2): the directed plan, the pictures, the soundtrack. The voice is `voice`, above.
   */
  reuse: PipelineReuse;
  /** The take now belongs to the job (the hand-off is cleared). */
  owned: boolean;
  /** Guards against rapid double-clicks on "Make main" while loading the replacement blob. */
  swapping?: boolean;
  startProgress: number;
  lastProgressWrite: number;
}

interface JobsState {
  jobs: Record<string, Job>;
  order: string[];
}

export const useJobs = create<JobsState>(() => ({ jobs: {}, order: [] }));

const runtimes = new Map<string, Runtime>();
let provider: (() => JobDeps) | null = null;
let providerWaiters: (() => void)[] = [];

/** `<JobsHost/>` registers the live deps (credits client, config, uid). */
export function setJobDepsProvider(p: (() => JobDeps) | null): void {
  provider = p;
  if (p) {
    const waiting = providerWaiters;
    providerWaiters = [];
    waiting.forEach((fn) => fn());
  }
}

/** Resolves once deps are registered (a screen's effect can run before the host's). */
function depsReady(): Promise<void> {
  return provider ? Promise.resolve() : new Promise((r) => providerWaiters.push(r));
}

function deps(): JobDeps {
  if (!provider) throw new Error('Background jobs are not ready yet.');
  return provider();
}

export function newJobId(): string {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return `j-${Array.from(bytes, (b) => (b % 36).toString(36)).join('')}`;
}

const LIVE: ReadonlySet<JobStatus> = new Set(['preparing', 'queued', 'running']);
/** Statuses that hold the tab open (beforeunload, R6.5). */
export const isLive = (j: Pick<Job, 'status'>): boolean => LIVE.has(j.status);

function patch(id: string, fn: (j: Job) => Partial<Job>): void {
  useJobs.setState((s) => {
    const j = s.jobs[id];
    if (!j) return s;
    return { jobs: { ...s.jobs, [id]: { ...j, ...fn(j) } } };
  });
}

/** Typed words (single graphic) or the synthesized sample's own (D-024); else Whisper runs. */
const wordsOf = (meta: PendingIntake) =>
  meta.words ?? (meta.source === 'sample' ? sampleWords() : undefined);

const kindOf = (take: PendingTake): JobKind => {
  if (take.meta.single && take.meta.graphicPrompt?.trim()) return 'graphic';
  if (!take.blob) return 'voiceover';
  const r = validateIntake({ name: take.meta.name, type: take.blob.type, size: take.blob.size });
  return r.ok && r.kind === 'video' ? 'video' : 'voiceover';
};

function titleOf(take: PendingTake): string {
  if (take.draft.title && take.draft.title !== START_COPY.untitled) return take.draft.title;
  return (
    take.meta.name
      .replace(/\.[a-z0-9]{2,5}$/i, '')
      .trim()
      .slice(0, 80) || 'Untitled Project'
  );
}

/**
 * Starts a job for a pending take and its free preparation. The same take (same stored ref)
 * returns the job already preparing it, so a remount or a second effect never prepares twice.
 */
export function prepare(take: PendingTake, now = Date.now()): string {
  const ref = take.meta.ref;
  if (ref) {
    for (const [id, rt] of runtimes) {
      const j = useJobs.getState().jobs[id];
      if (rt.take.meta.ref === ref && j && j.status === 'preparing') return id;
    }
  }
  const id = newJobId();
  const kind = kindOf(take);
  const initialWords = wordsOf(take.meta);
  const initialTranscript =
    take.meta.tts?.script.trim() ||
    take.meta.graphicPrompt?.trim() ||
    (initialWords?.length ? initialWords.map((w) => w.text).join(' ').trim() : '') ||
    undefined;
  const initialExtras: JobExtraClip[] = (take.meta.extraClips ?? []).map((c) => ({
    ref: c.ref,
    name: c.name,
    mimeType: c.mimeType,
    ...(c.sizeBytes !== undefined ? { sizeBytes: c.sizeBytes } : {}),
    ...(c.kindHint ? { kindHint: c.kindHint } : {}),
  }));
  const job: Job = {
    id,
    title: titleOf(take),
    kind,
    source: take.meta.source,
    media: {
      name: take.meta.name,
      mimeType: take.blob?.type ?? 'audio/wav',
      sizeBytes: take.blob?.size ?? 0,
    },
    ...(initialExtras.length ? { extraClips: initialExtras } : {}),
    ...(take.meta.tts ? { script: take.meta.tts.script } : {}),
    ...(take.meta.graphicPrompt ? { graphicPrompt: take.meta.graphicPrompt } : {}),
    ...(initialTranscript ? { transcriptText: initialTranscript } : {}),
    format: take.draft.format,
    status: 'preparing',
    prep:
      kind === 'graphic' || !take.blob
        ? { pct: 100, stage: 'ready' }
        : { pct: 2, stage: 'reading' },
    processing: initialProcessing(),
    createdAt: now,
    progressPct: 0,
    etaMs: null,
  };
  useJobs.setState((s) => ({ jobs: { ...s.jobs, [id]: job }, order: [...s.order, id] }));
  const rt: Runtime = {
    abort: new AbortController(),
    take,
    transcriptReady: kind === 'graphic',
    progressListeners: new Set(),
    priority: 'prep',
    reuse: {},
    owned: false,
    startProgress: 0,
    lastProgressWrite: 0,
  };
  runtimes.set(id, rt);
  if (take.blob && kind !== 'graphic') void runPrep(id, rt, take.blob);
  if (initialExtras.length) void probeExtraClips(id, rt, initialExtras.map((c) => c.ref));
  return id;
}

const MAX_CONFIG_EXTRA_CLIPS = 12;

function audioStoreOf() {
  try {
    return deps().pipeline.audioStore;
  } catch {
    return appAudioStore();
  }
}

async function sampleImageThumb(blob: Blob): Promise<{
  thumbUrl?: string;
  width?: number;
  height?: number;
}> {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return {};
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('decode'));
      el.src = url;
    });
    const w = Math.max(1, img.naturalWidth || 1);
    const h = Math.max(1, img.naturalHeight || 1);
    const scale = Math.min(1, 240 / Math.max(w, h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(32, Math.round(w * scale));
    canvas.height = Math.max(32, Math.round(h * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return { width: w, height: h };
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { thumbUrl: canvas.toDataURL('image/jpeg', 0.72), width: w, height: h };
  } catch {
    return {};
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function probeExtraClips(id: string, rt: Runtime, refs: readonly string[]): Promise<void> {
  if (refs.length === 0) return;
  const store = audioStoreOf();
  let probeVideo: PipelineDeps['probeVideo'];
  try {
    probeVideo = deps().pipeline.probeVideo;
  } catch {
    probeVideo = undefined;
  }
  for (const ref of refs) {
    if (rt.abort.signal.aborted) return;
    const cur = useJobs.getState().jobs[id]?.extraClips?.find((c) => c.ref === ref);
    if (!cur || cur.thumbUrl) continue;
    const blob = await store.get(ref).catch(() => null);
    if (!blob || rt.abort.signal.aborted) continue;
    const sizeBytes = cur.sizeBytes ?? blob.size;
    if (cur.mimeType.startsWith('video/') && probeVideo) {
      const p = await probeVideo(blob).catch(() => null);
      if (rt.abort.signal.aborted) return;
      if (p) {
        const f = p.frames[0];
        patch(id, (j) => ({
          extraClips: (j.extraClips ?? []).map((c) =>
            c.ref === ref
              ? {
                  ...c,
                  sizeBytes,
                  durationMs: p.durationMs,
                  width: p.width,
                  height: p.height,
                  ...(f ? { thumbUrl: `data:image/jpeg;base64,${f.base64}` } : {}),
                }
              : c,
          ),
        }));
      }
    } else if (cur.mimeType.startsWith('image/')) {
      const sampled = await sampleImageThumb(blob);
      if (rt.abort.signal.aborted) return;
      patch(id, (j) => ({
        extraClips: (j.extraClips ?? []).map((c) =>
          c.ref === ref
            ? {
                ...c,
                sizeBytes,
                ...(sampled.width ? { width: sampled.width } : {}),
                ...(sampled.height ? { height: sampled.height } : {}),
                ...(sampled.thumbUrl ? { thumbUrl: sampled.thumbUrl } : {}),
              }
            : c,
        ),
      }));
    }
  }
}

function syncPending(rt: Runtime): void {
  if (!rt.owned) {
    try {
      updatePendingMeta(rt.take.meta, rt.take.draft);
    } catch {
      /* sessionStorage unavailable */
    }
  }
}

/** Attaches additional B-roll, screen recordings, or screenshots to a preparing job (spec 48). */
export async function addJobExtraClips(
  id: string,
  files: readonly File[],
): Promise<{ added: number; skipped: number }> {
  const rt = runtimes.get(id);
  const j = useJobs.getState().jobs[id];
  if (!rt || !j || j.status !== 'preparing') return { added: 0, skipped: files.length };
  const existing = rt.take.meta.extraClips ?? [];
  const room = Math.max(0, MAX_CONFIG_EXTRA_CLIPS - existing.length);
  if (room === 0) return { added: 0, skipped: files.length };
  const store = audioStoreOf();
  const nextMeta: PendingExtraClip[] = [...existing];
  const nextJob: JobExtraClip[] = [...(j.extraClips ?? [])];
  const addedRefs: string[] = [];
  let skipped = 0;
  for (const file of files) {
    if (addedRefs.length >= room || !isSupportedMediaBinFile(file)) {
      skipped++;
      continue;
    }
    const ref = await store.put(file);
    const mimeType = guessMimeType(file);
    const clipMeta: PendingExtraClip = {
      ref,
      name: file.name.slice(0, 120),
      mimeType,
      sizeBytes: file.size,
    };
    nextMeta.push(clipMeta);
    nextJob.push({ ...clipMeta });
    addedRefs.push(ref);
  }
  if (addedRefs.length === 0) return { added: 0, skipped };
  rt.take = {
    ...rt.take,
    meta: { ...rt.take.meta, extraClips: nextMeta },
  };
  syncPending(rt);
  patch(id, () => ({ extraClips: nextJob }));
  void probeExtraClips(id, rt, addedRefs);
  return { added: addedRefs.length, skipped };
}

/** Removes one extra clip from a preparing job and frees its local blob (spec 48). */
export function removeJobExtraClip(id: string, ref: string): void {
  const rt = runtimes.get(id);
  const j = useJobs.getState().jobs[id];
  if (!rt || !j || j.status !== 'preparing') return;
  const nextMeta = (rt.take.meta.extraClips ?? []).filter((c) => c.ref !== ref);
  const nextJob = (j.extraClips ?? []).filter((c) => c.ref !== ref);
  const nextTakeMeta: PendingIntake = { ...rt.take.meta };
  if (nextMeta.length) nextTakeMeta.extraClips = nextMeta;
  else delete nextTakeMeta.extraClips;
  rt.take = { ...rt.take, meta: nextTakeMeta };
  syncPending(rt);
  patch(id, () => ({ extraClips: nextJob.length ? nextJob : undefined }));
  void audioStoreOf()
    .delete(ref)
    .catch(() => undefined);
}

/** Sets or clears the creator's role hint (`broll`, `screen-recording`, `screenshot`, `photo`) on an extra clip (spec 48). */
export function setJobExtraClipKind(
  id: string,
  ref: string,
  kindHint: MediaClipKind | undefined,
): void {
  const rt = runtimes.get(id);
  const j = useJobs.getState().jobs[id];
  if (!rt || !j || j.status !== 'preparing') return;
  const apply = <T extends { ref: string; kindHint?: MediaClipKind }>(list: readonly T[]): T[] =>
    list.map((c) => {
      if (c.ref !== ref) return c;
      if (kindHint) return { ...c, kindHint };
      const copy = { ...c };
      delete copy.kindHint;
      return copy;
    });
  rt.take = {
    ...rt.take,
    meta: {
      ...rt.take.meta,
      ...(rt.take.meta.extraClips ? { extraClips: apply(rt.take.meta.extraClips) } : {}),
    },
  };
  syncPending(rt);
  patch(id, (cur) => ({
    ...(cur.extraClips ? { extraClips: apply(cur.extraClips) } : {}),
  }));
}

/**
 * Promotes one of the attached video/audio extra clips to become the main A-roll talking head,
 * demoting the previous primary into `extraClips` and restarting free local preparation (spec 48 R1.3).
 */
export async function swapJobPrimaryClip(
  id: string,
  ref: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const rt = runtimes.get(id);
  const j0 = useJobs.getState().jobs[id];
  if (!rt || !j0 || j0.status !== 'preparing' || rt.swapping) {
    return { ok: false, message: 'Cannot change the main clip right now.' };
  }
  const targetMeta0 = (rt.take.meta.extraClips ?? []).find((c) => c.ref === ref);
  if (!targetMeta0) {
    return { ok: false, message: 'Clip not found.' };
  }
  if (!targetMeta0.mimeType.startsWith('video/') && !targetMeta0.mimeType.startsWith('audio/')) {
    return { ok: false, message: 'Only a video or audio clip can be the main talking-head track.' };
  }
  rt.swapping = true;
  let nextBlob: Blob | null;
  try {
    nextBlob = await audioStoreOf()
      .get(ref)
      .catch(() => null);
  } finally {
    rt.swapping = false;
  }
  if (!nextBlob) {
    return { ok: false, message: "Couldn't read that clip from browser storage." };
  }
  // Re-validate after the async read in case the job was submitted, cancelled, or edited.
  const j = useJobs.getState().jobs[id];
  const targetJob = (j?.extraClips ?? []).find((c) => c.ref === ref);
  const targetMeta = (rt.take.meta.extraClips ?? []).find((c) => c.ref === ref);
  if (!j || j.status !== 'preparing' || !targetJob || !targetMeta) {
    return { ok: false, message: 'Cannot change the main clip right now.' };
  }

  // Abort any in-flight prep for the old primary.
  rt.abort.abort();
  rt.abort = new AbortController();
  rt.audio = undefined;
  rt.probe = undefined;
  rt.transcript = undefined;
  rt.transcriptReady = false;
  rt.lastProgress = undefined;
  rt.reuse = {};

  const oldRef = rt.take.meta.ref;
  const remainingMeta = (rt.take.meta.extraClips ?? []).filter((c) => c.ref !== ref);
  const remainingJob = (j.extraClips ?? []).filter((c) => c.ref !== ref);

  // Move old primary into extraClips if it has a ref and is a supported Media Bin clip;
  // otherwise delete the orphaned audio blob so IndexedDB never leaks.
  const canDemoteOld =
    Boolean(oldRef) &&
    (j.media.mimeType.startsWith('video/') ||
      /\.(mp4|mov|webm)$/i.test(j.media.name));
  if (oldRef && canDemoteOld) {
    const oldMeta: PendingExtraClip = {
      ref: oldRef,
      name: rt.take.meta.name.slice(0, 120),
      mimeType: j.media.mimeType || 'video/mp4',
      sizeBytes: j.media.sizeBytes,
    };
    remainingMeta.unshift(oldMeta);
    remainingJob.unshift({
      ...oldMeta,
      ...(j.media.durationMs !== undefined ? { durationMs: j.media.durationMs } : {}),
      ...(j.media.width !== undefined ? { width: j.media.width } : {}),
      ...(j.media.height !== undefined ? { height: j.media.height } : {}),
      ...(j.media.thumbUrl ? { thumbUrl: j.media.thumbUrl } : {}),
    });
  } else if (oldRef && oldRef !== ref) {
    void audioStoreOf()
      .delete(oldRef)
      .catch(() => undefined);
  }

  const nextMeta: PendingIntake = {
    ...rt.take.meta,
    ref: targetMeta.ref,
    name: targetMeta.name,
    ...(remainingMeta.length ? { extraClips: remainingMeta } : {}),
  };
  if (!remainingMeta.length) delete nextMeta.extraClips;

  rt.take = { ...rt.take, blob: nextBlob, meta: nextMeta };
  syncPending(rt);

  const nextKind = kindOf(rt.take);
  patch(id, () => ({
    title: titleOf(rt.take),
    kind: nextKind,
    media: {
      name: targetMeta.name,
      mimeType: targetMeta.mimeType || nextBlob.type || 'video/mp4',
      sizeBytes: targetJob.sizeBytes ?? nextBlob.size,
      ...(targetJob.durationMs !== undefined ? { durationMs: targetJob.durationMs } : {}),
      ...(targetJob.width !== undefined ? { width: targetJob.width } : {}),
      ...(targetJob.height !== undefined ? { height: targetJob.height } : {}),
      ...(targetJob.thumbUrl ? { thumbUrl: targetJob.thumbUrl } : {}),
    },
    extraClips: remainingJob.length ? remainingJob : undefined,
    transcriptText: undefined,
    prep: { pct: 2, stage: 'reading' },
  }));
  void runPrep(id, rt, nextBlob);
  return { ok: true };
}

/** Updates a preparing job's output aspect ratio (16:9, 9:16, 1:1) from the configure screen. */
export function setJobFormat(id: string, format: Format): void {
  const rt = runtimes.get(id);
  if (!rt) return;
  rt.take = {
    ...rt.take,
    draft: { ...rt.take.draft, format, formatChosen: true },
  };
  patch(id, () => ({ format }));
}

type WhisperProgress = { stage: 'loading' | 'transcribing'; percent?: number };

/**
 * Decode, probe and transcribe are shared by preparation and the run through the runtime, and
 * created by whichever asks first, so Create before preparation has started still does each of
 * them once (R2.8).
 */
function audioOf(rt: Runtime, blob: Blob, base: PipelineDeps): Promise<DecodedAudio> {
  return (rt.audio ??= base.decode(blob));
}

function probeOf(rt: Runtime, blob: Blob, base: PipelineDeps): Promise<VideoProbeResult | null> {
  if (!base.probeVideo) return Promise.resolve(null);
  return (rt.probe ??= base.probeVideo(blob).catch(() => null));
}

function transcriptOf(
  rt: Runtime,
  base: PipelineDeps,
  pcm: Float32Array,
  durationMs: number,
): Promise<TranscribeOutput> {
  if (!rt.transcript) {
    const p = withWhisper(
      () => rt.priority,
      () =>
        base.transcribe(pcm, durationMs, (e) => {
          rt.lastProgress = e;
          rt.progressListeners.forEach((fn) => fn(e));
        }),
      rt.abort.signal,
    );
    rt.transcript = p;
    p.then(
      () => {
        if (rt.transcript === p) rt.transcriptReady = true;
      },
      // A failed or cancelled transcription is asked for again by whoever needs it next.
      () => {
        if (rt.transcript === p) rt.transcript = undefined;
      },
    );
  }
  return rt.transcript;
}

async function runPrep(id: string, rt: Runtime, blob: Blob): Promise<void> {
  const fail = (error: string) => patch(id, () => ({ prep: { pct: 0, stage: 'failed', error } }));
  const intake = validateIntake({ name: rt.take.meta.name, type: blob.type, size: blob.size });
  if (!intake.ok) return fail(intake.message);
  await depsReady();
  if (rt.abort.signal.aborted) return;
  let d: JobDeps;
  try {
    d = deps();
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
  const single = Boolean(rt.take.meta.single);
  const base = d.pipeline;
  let audio: DecodedAudio;
  try {
    audio = await audioOf(rt, blob, base);
  } catch {
    rt.audio = undefined;
    return fail("I couldn't read that file. Try MP4, MOV, MP3, WAV or M4A.");
  }
  if (rt.abort.signal.aborted) return;
  const dur = checkDuration(audio.durationMs);
  if (!dur.ok) return fail(dur.message);
  if (!single && isSilent(audio.pcm16k)) return fail("I couldn't hear anything in that file.");
  patch(id, (j) => ({
    prep: { pct: 25, stage: 'probing' },
    media: { ...j.media, durationMs: audio.durationMs },
  }));

  if (intake.kind === 'video' && base.probeVideo) {
    const probe = await probeOf(rt, blob, base);
    if (rt.abort.signal.aborted) return;
    if (probe) {
      const f = probe.frames[0];
      patch(id, (j) => ({
        media: {
          ...j.media,
          width: probe.width,
          height: probe.height,
          ...(f ? { thumbUrl: `data:image/jpeg;base64,${f.base64}` } : {}),
        },
      }));
    }
  }
  patch(id, () => ({ prep: { pct: 35, stage: 'transcribing' } }));

  const words = wordsOf(rt.take.meta);
  if (words && !rt.transcript) {
    rt.transcript = Promise.resolve({ words, ranOn: 'device', timingQuality: 'word' });
    rt.transcriptReady = true;
  }
  const onProgress = (p: WhisperProgress) => {
    // The first run downloads the speech model (minutes on a slow line): say so, with its percent.
    if (p.stage === 'loading') {
      if (p.percent === undefined) return;
      const model = Math.min(99, Math.round(p.percent));
      patch(id, (j) => (j.prep.stage === 'transcribing' ? { prep: { ...j.prep, model } } : {}));
      return;
    }
    if (p.percent === undefined) return;
    const pct = 35 + Math.round((Math.min(100, p.percent) / 100) * 64);
    patch(id, (j) =>
      j.prep.stage === 'transcribing' ? { prep: { pct, stage: 'transcribing' } } : {},
    );
  };
  rt.progressListeners.add(onProgress);
  if (rt.lastProgress) onProgress(rt.lastProgress);
  try {
    const tr = await transcriptOf(rt, base, audio.pcm16k, audio.durationMs);
    const text = tr.words
      .map((w) => w.text)
      .join(' ')
      .trim();
    patch(id, () => ({
      prep: { pct: 100, stage: 'ready' },
      ...(text ? { transcriptText: text } : {}),
    }));
  } catch {
    // The job transcribes again when it runs; the take itself is fine.
    if (!rt.abort.signal.aborted) patch(id, () => ({ prep: { pct: 100, stage: 'ready' } }));
  } finally {
    rt.progressListeners.delete(onProgress);
  }
}

/** Labels for the dashboard card and the processing page. */
function labels(edit: EditConfig, kind: JobKind): Pick<Job, 'recipeLabel' | 'styleLabel'> {
  const recipe =
    edit.recipeId === 'custom' ? 'Your recipe' : builtInSkills.recipe(edit.recipeId)?.name;
  const style = edit.customStyle
    ? 'Your style'
    : kind === 'video'
      ? styleFor(edit.recipeId, edit.styleId).name
      : edit.styleId
          .split('-')
          .map((w) => w[0]!.toUpperCase() + w.slice(1))
          .join(' ');
  return { ...(recipe ? { recipeLabel: recipe } : {}), styleLabel: style };
}

/**
 * Queues a prepared job with the creator's choices. Idempotent: only a `preparing` job moves
 * (a double-clicked Create submits once, review fix #2). Returns false when nothing happened.
 */
export function submit(id: string, edit: EditConfig): boolean {
  const j = useJobs.getState().jobs[id];
  const rt = runtimes.get(id);
  if (!j || !rt || j.status !== 'preparing' || j.prep.stage === 'failed') return false;
  rt.edit = edit;
  rt.priority = 'job';
  try {
    rt.uid = deps().uid;
  } catch {
    rt.uid = null;
  }
  // The job owns the stored take now; the hand-off goes (review fix #6).
  if (!rt.owned) {
    rt.owned = true;
    void clearPending({ keepAudio: true }).catch(() => undefined);
  }
  patch(id, () => ({ status: 'queued', ...labels(edit, j.kind) }));
  pump();
  return true;
}

/**
 * The job whose pipeline is executing. A cancelled job keeps the slot until its run has really
 * stopped (the abort is only seen at the next checkpoint), so two pipelines never overlap.
 */
let runningId: string | null = null;

function pump(): void {
  if (runningId) return;
  const { jobs, order } = useJobs.getState();
  const next = order.find((id) => jobs[id]?.status === 'queued');
  if (next) void run(next);
}

function pipelineInput(rt: Runtime, file: Blob, kind: JobKind): PipelineInput {
  const { meta, draft } = rt.take;
  return {
    file,
    name: meta.name,
    source: meta.source,
    ...(meta.ref ? { storedRef: meta.ref } : {}),
    ...(draft.title !== START_COPY.untitled ? { title: draft.title } : {}),
    // Uploaded videos match their own aspect ratio unless a format was picked on Start.
    ...(draft.formatChosen || kind !== 'video' ? { format: draft.format } : {}),
    cleanup: meta.source === 'tts' ? false : meta.cleanup,
    ...(draft.styleId ? { styleId: draft.styleId } : {}),
    ...(meta.tts ? { tts: meta.tts } : {}),
    ...(wordsOf(meta) ? { words: wordsOf(meta)! } : {}),
    ...(meta.extraClips?.length ? { extraClips: meta.extraClips } : {}),
    ...(meta.single ? { single: true } : {}),
    ...(meta.graphicPrompt ? { graphicPrompt: meta.graphicPrompt } : {}),
    ...(meta.graphicLook ? { graphicLook: meta.graphicLook } : {}),
    ...(rt.edit && (!meta.single || Boolean(meta.graphicPrompt)) ? { edit: rt.edit } : {}),
    ...(Object.keys(rt.reuse).length ? { reuse: { ...rt.reuse } } : {}),
  };
}

/** Pipeline deps that pick up what preparation already did (R2.8: nothing done twice). */
function preparedDeps(base: PipelineDeps, rt: Runtime): PipelineDeps {
  const { directReel, resolveReelMedia, resolveReelMusic } = base;
  return {
    ...base,
    // Paid results are kept on the runtime the moment they arrive; a call that is cancelled or
    // throws keeps nothing (the paid function has already handed the price back).
    ...(directReel
      ? {
          directReel: async (p: Parameters<typeof directReel>[0]) => {
            const r = await directReel(p);
            // Only the cloud plan was paid for; the free one is made again at no cost.
            if (r.source === 'cloud') rt.reuse.reel = r;
            return r;
          },
        }
      : {}),
    ...(resolveReelMedia
      ? {
          resolveReelMedia: async (p: Parameters<typeof resolveReelMedia>[0]) => {
            const r = await resolveReelMedia(p);
            if (r.assets.some((a) => a.source === 'generated')) rt.reuse.media = r;
            return r;
          },
        }
      : {}),
    ...(resolveReelMusic
      ? {
          resolveReelMusic: async (p: Parameters<typeof resolveReelMusic>[0]) => {
            const r = await resolveReelMusic(p);
            if (r.music?.src) rt.reuse.music = r;
            return r;
          },
        }
      : {}),
    decode: (file) => audioOf(rt, file, base),
    ...(base.probeVideo
      ? {
          probeVideo: (file: Blob) =>
            probeOf(rt, file, base).then(
              (p) => p ?? Promise.reject(new Error('Video probe failed')),
            ),
        }
      : {}),
    transcribe: async (pcm, durationMs, onProgress) => {
      rt.progressListeners.add(onProgress);
      if (rt.lastProgress) onProgress(rt.lastProgress);
      try {
        try {
          return await transcriptOf(rt, base, pcm, durationMs);
        } catch (err) {
          if (rt.abort.signal.aborted) throw err;
          return await transcriptOf(rt, base, pcm, durationMs);
        }
      } finally {
        rt.progressListeners.delete(onProgress);
      }
    },
  };
}

async function run(id: string): Promise<void> {
  const rt = runtimes.get(id);
  const j0 = useJobs.getState().jobs[id];
  if (!rt || !j0) return;
  runningId = id;
  const startedAt = Date.now();
  rt.startProgress = rt.transcriptReady ? STEP_WEIGHTS[j0.kind].transcribe : 0;
  patch(id, () => ({
    status: 'running',
    startedAt,
    processing: initialProcessing(),
    progressPct: Math.round(rt.startProgress * 100),
    etaMs: null,
    error: undefined,
    intakeError: undefined,
  }));
  const onEvent = (e: PipelineEvent) => {
    const now = Date.now();
    // Whisper reports often; the store takes at most ~7 of those a second (review fix #28).
    if (e.type === 'progress' && now - rt.lastProgressWrite < 150) return;
    if (e.type === 'progress') rt.lastProgressWrite = now;
    patch(id, (j) => {
      const processing = reduceProcessing(j.processing, e);
      const steps = Object.fromEntries(
        Object.entries(processing.steps).map(([k, v]) => [k, v.state]),
      ) as Parameters<typeof jobProgress>[1];
      const within = e.type === 'progress' && e.percent !== undefined ? e.percent / 100 : null;
      const p = Math.max(j.progressPct / 100, jobProgress(j.kind, steps, within));
      return {
        processing,
        progressPct: Math.round(p * 100),
        etaMs: etaMs({
          kind: j.kind,
          mediaMs: j.media.durationMs ?? processing.durationMs,
          progress: p,
          elapsedMs: now - startedAt,
          startProgress: rt.startProgress,
        }),
      };
    });
  };

  try {
    const d = deps();
    let file: Blob | null = rt.take.blob;
    if (!file) {
      file = await makeVoice(id, rt, d);
      if (!file) return; // makeVoice set the error
    }
    const { projectId } = await runPipeline(
      pipelineInput(rt, file, j0.kind),
      preparedDeps(d.pipeline, rt),
      onEvent,
      rt.abort.signal,
    );
    patch(id, () => ({
      status: 'done',
      projectId,
      progressPct: 100,
      etaMs: 0,
      finishedAt: Date.now(),
    }));
  } catch (err) {
    if (rt.abort.signal.aborted) return; // cancel() already set the status
    console.error('[jobs]', err, err instanceof Error ? err.cause : undefined);
    const intake = err instanceof Error && 'step' in err && err.step === 'intake';
    patch(id, () => ({
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
      ...(intake ? { intakeError: true } : {}),
      etaMs: null,
      finishedAt: Date.now(),
    }));
  } finally {
    runningId = null;
    pump();
  }
}

/** The script's voice, made after Create (R2.4). Cached on the runtime so Retry never pays twice. */
async function makeVoice(id: string, rt: Runtime, d: JobDeps): Promise<Blob | null> {
  if (rt.voice) return rt.voice;
  const tts = rt.take.meta.tts;
  if (!tts) throw new Error('Nothing to voice');
  patch(id, (j) => ({
    processing: reduceProcessing(j.processing, {
      type: 'step',
      step: 'transcribe',
      state: 'active',
      detail: 'Making the voice',
      route: 'cloud',
    }),
  }));
  const out = await generateVoice(
    {
      credits: d.credits,
      config: d.config ?? APP_CONFIG_DEFAULTS,
      onPart: (done, total) =>
        patch(id, (j) => ({
          processing: reduceProcessing(j.processing, {
            type: 'step',
            step: 'transcribe',
            state: 'active',
            detail: `Making the voice · part ${done} of ${total}`,
            route: 'cloud',
          }),
        })),
    },
    { text: tts.script, voice: voiceIdOf(tts.voiceId), speed: tts.speed },
    rt.abort.signal,
  );
  if (rt.abort.signal.aborted) return null;
  if (!out.ok) {
    patch(id, () => ({ status: 'error', error: out.reason, etaMs: null, finishedAt: Date.now() }));
    return null;
  }
  rt.voice = out.file;
  patch(id, (j) => ({ media: { ...j.media, durationMs: out.durationMs, mimeType: 'audio/wav' } }));
  return out.file;
}

const voiceIdOf = (v: string): TtsVoiceId =>
  TTS_VOICES.find((x) => x.id === v)?.id ?? TTS_VOICES[0].id;

/**
 * True while the hand-off still points at this job's take. A newer drop replaces the hand-off, and
 * clearing it then would throw the newer take away (review run 7): a ref is compared by value, a
 * script (no ref) by its text.
 */
function handOffIsMine(rt: Runtime): boolean {
  try {
    const p = peekPending();
    if (!p) return false;
    const mine = rt.take.meta;
    if (mine.ref) return p.meta.ref === mine.ref;
    const script = mine.tts?.script;
    return !p.meta.ref && script !== undefined && p.meta.tts?.script === script;
  } catch {
    return false;
  }
}

async function dropTake(rt: Runtime): Promise<void> {
  const ref = rt.take.meta.ref;
  // Not yet owned and still the hand-off: clear it (and its audio). Otherwise only this job's own
  // stored audio goes; the hand-off belongs to someone else now.
  if (!rt.owned && handOffIsMine(rt))
    await clearPending({ keepAudio: false }).catch(() => undefined);
  else if (ref) {
    try {
      await deps().pipeline.audioStore.delete(ref);
    } catch {
      /* best effort */
    }
  }
  for (const c of rt.take.meta.extraClips ?? []) {
    try {
      await deps().pipeline.audioStore.delete(c.ref);
    } catch {
      /* best effort */
    }
  }
}

/** Stops a job (the only thing that does, R6.1). Its stored take is deleted. */
export function cancel(id: string): void {
  const rt = runtimes.get(id);
  const j = useJobs.getState().jobs[id];
  if (!rt || !j || j.status === 'done' || j.status === 'cancelled') return;
  rt.abort.abort();
  patch(id, () => ({ status: 'cancelled', etaMs: null, finishedAt: Date.now() }));
  void dropTake(rt);
  // A running job frees the queue when its run ends (see `runningId`), not here.
  pump();
}

/** Runs a failed job again with what it already has (prepared audio, transcript, voice). */
export function retry(id: string): boolean {
  const rt = runtimes.get(id);
  const j = useJobs.getState().jobs[id];
  if (!rt || !j || j.status !== 'error' || j.intakeError) return false;
  rt.abort = new AbortController();
  patch(id, () => ({ status: 'queued', error: undefined }));
  pump();
  return true;
}

/** Removes a finished job from the list (and a failed one's stored take). */
export function dismiss(id: string): void {
  const rt = runtimes.get(id);
  const j = useJobs.getState().jobs[id];
  if (!j) return;
  if (isLive(j)) cancel(id);
  else if (rt && (j.status === 'error' || j.status === 'cancelled')) void dropTake(rt);
  runtimes.delete(id);
  useJobs.setState((s) => {
    const jobs = { ...s.jobs };
    delete jobs[id];
    return { jobs, order: s.order.filter((x) => x !== id) };
  });
}

/**
 * Drops a job that never reached Create (the creator left the configure screen). Its preparation
 * stops; the stored take and the hand-off stay, so coming back (or a reload) prepares it again
 * and an abandoned job never holds the tab open. Does nothing to a job past `preparing`.
 */
export function release(id: string): void {
  const rt = runtimes.get(id);
  const j = useJobs.getState().jobs[id];
  if (!rt || !j || j.status !== 'preparing') return;
  rt.abort.abort();
  runtimes.delete(id);
  useJobs.setState((s) => {
    const jobs = { ...s.jobs };
    delete jobs[id];
    return { jobs, order: s.order.filter((x) => x !== id) };
  });
}

/** The configure screen's Remove: the take goes, and the job with it. */
export function discard(id: string): void {
  dismiss(id);
}

/** An account change mid-job cancels the jobs started under another account (R6.10). */
export function cancelForOtherUser(uid: string | null): void {
  for (const [id, rt] of runtimes) {
    const j = useJobs.getState().jobs[id];
    if (!j || !isLive(j) || j.status === 'preparing') continue;
    if (rt.uid !== undefined && rt.uid !== uid) cancel(id);
  }
}

/**
 * Jobs somebody is looking at, with how many screens look. A finished watched job opens by itself
 * and gets no "ready" toast (R6.6). Counted, not a plain set: the configure screen watches a job
 * across the route change while the processing screen takes over, and the first to let go must not
 * unwatch the second.
 */
const watched = new Map<string, number>();

/** Marks a job as watched until the returned function is called (idempotent). */
export function watch(id: string): () => void {
  watched.set(id, (watched.get(id) ?? 0) + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const n = (watched.get(id) ?? 1) - 1;
    if (n <= 0) watched.delete(id);
    else watched.set(id, n);
  };
}

export const isWatched = (id: string): boolean => watched.has(id);

/** Test hook. */
export function resetJobsForTest(): void {
  for (const rt of runtimes.values()) rt.abort.abort();
  runtimes.clear();
  watched.clear();
  runningId = null;
  useJobs.setState({ jobs: {}, order: [] });
}
