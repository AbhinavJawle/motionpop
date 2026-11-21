import {
  autoReelPlan,
  planVideo,
  postPass,
  tagSpans,
  type AudioEdlCutInput,
  type EnforcedVideoPlan,
  type PlannedVideo,
  type TaggedSpan,
  type ValidatedParams,
} from '@motionpop/ai';
import { markAutoChoreograph } from '@/lib/film/auto-choreograph';
import {
  APP_CONFIG_DEFAULTS,
  DEFAULT_AUDIO,
  DEFAULT_CAPTIONS,
  EditorProjectSchema,
  cleanedDurationFromSegments,
  keptSourceSegments,
  type EditorProject,
  type Format,
  type Look,
  type MediaClip,
  type OverlayAnchor,
  type PendingExtraClip,
  type ReelLook,
  type ReelPlan,
  type ReelWord,
  type VideoCut,
  type Slot,
  type SlotPlacement,
  type SlotSuggestion,
  type Transcript,
  type Version,
  type VideoTrack,
  type Voiceover,
  type Word,
} from '@motionpop/schemas';
import type { VideoProbeResult } from '../video/frames';
import { graphicForWords } from '../slots/graphic-types';
import type { AudioStore } from '../audio/audio-store';
import { isSilent, OUTPUT_SAMPLE_RATE, type DecodedAudio } from '../audio/decode';
import { buildEdl, cleanedDuration, retimeWords } from '../audio/edl';
import { checkDuration, validateIntake } from '../audio/intake';
import { prosody as analyseProsody, stressedCount, type Prosody } from '../audio/prosody';
import { styleFor } from '../composition/project-to-compile';
import {
  applyPlan,
  directorRequest,
  planSummary,
  type DirectorRequest,
} from '../director/director';
import type { ProjectRepository } from '../projects/repository';
import {
  cleanupSummary,
  momentsSummary,
  PipelineError,
  slotsSummary,
  transcriptSummary,
  type PipelineEvent,
  type PipelineStep,
} from './events';

export interface PipelineInput {
  file: Blob;
  /** File name, for intake checks and the project title. */
  name: string;
  source: 'upload' | 'record' | 'sample' | 'tts';
  /** Use these words instead of transcribing (the synthesized sample, D-024). */
  words?: Word[];
  /**
   * The ref of `file` when it is already in the audio store (a pending intake, spec 11). It
   * becomes the original audio as-is, and a failed run leaves it in place for a retry.
   */
  storedRef?: string;
  /** From the Start draft (spec 11 R7). Defaults: the file name, 16:9, `deps.styleId`. */
  title?: string;
  format?: Format;
  styleId?: string;
  /** False skips the cut list (generated voices, spec 05 R6.1). Default true. */
  cleanup?: boolean;
  tts?: NonNullable<Voiceover['tts']>;
  /** Optional extra B-roll / screen-recording / screenshot clips dropped alongside the main file (spec 20). */
  extraClips?: PendingExtraClip[];
  /** A single graphic: silent audio with typed `words`, one slot over all of them, no captions. */
  single?: boolean;
  /** The reel look for video uploads (spec 25). Default `mono`. */
  reelLook?: ReelLook;
}

export interface TranscribeOutput {
  words: Word[];
  ranOn: Transcript['ranOn'];
  timingQuality: Transcript['timingQuality'];
}

export interface PipelineDeps {
  decode(file: Blob): Promise<DecodedAudio>;
  transcribe(
    pcm16k: Float32Array,
    durationMs: number,
    onProgress: (p: { stage: 'loading' | 'transcribing'; percent?: number }) => void,
  ): Promise<TranscribeOutput>;
  renderCleaned(
    pcm: Float32Array,
    sampleRate: number,
    cuts: ReadonlyArray<{ startMs: number; endMs: number }>,
  ): Promise<Float32Array>;
  encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer;
  audioStore: AudioStore;
  repo: ProjectRepository;
  now(): number;
  newId(): string;
  styleId: string;
  /** Slot detection (spec 06): the deterministic detector, or AI through the router. */
  detect(words: Word[], spans: TaggedSpan[]): Promise<SlotSuggestion[]>;
  /** Component param validation for the post-pass (fills defaults, lists `needsInput`). */
  validateParams(componentId: string, params: Record<string, unknown>): ValidatedParams;
  /**
   * The director (spec 07 R6.1): `direct.plan` device first, then a free cloud plan if the
   * server allows one, else the built-in rules. Default: the built-in rules only.
   */
  direct?(req: DirectorRequest): Promise<PlannedVideo>;
  /** Video probe + keyframe sampler for uploaded video files (spec 18 R4.1). */
  probeVideo?(file: Blob): Promise<VideoProbeResult>;
  /** Multimodal AI video director (`video.direct`, Gemini 4 Neon, spec 18 R4.2). */
  directVideo?(params: {
    format: Format;
    styleId: string;
    durationMs: number;
    words: readonly Word[];
    frames: readonly { atMs: number; base64: string }[];
    audioEdlCuts: readonly AudioEdlCutInput[];
  }): Promise<EnforcedVideoPlan>;
  /**
   * The reel director (spec 25): talking-head uploads become a template reel. Default: the free
   * deterministic `autoReelPlan`.
   */
  directReel?(params: {
    look: ReelLook;
    words: readonly ReelWord[];
    durationMs: number;
  }): Promise<{ plan: ReelPlan; source: 'cloud' | 'auto'; error?: string }>;
  /** Optional extra-clip ingester for B-roll / screen-recordings / screenshots dropped on /start (spec 20). */
  ingestExtraClip?(clip: PendingExtraClip, projectId: string): Promise<MediaClip | null>;
  /** `imagesPerVideoMax` (Remote Config). */
  imagesMax?: number;
}

/** The director without a model: the code-only plan, enforced (never throws). */
export const rulesOnly = (req: DirectorRequest): Promise<PlannedVideo> =>
  planVideo(null, req.input, {
    cloudAllowed: () => Promise.resolve({ allowed: false, reason: 'unavailable' }),
    seed: req.seed,
  });

/** A first version for every ready slot, so the inspector history works (spec 06 design). */
export function firstVersions(
  slots: readonly Slot[],
  now: number,
): { slots: Slot[]; versions: Version[] } {
  const versions: Version[] = [];
  const out = slots.map((s) => {
    if (s.status !== 'ready') return s;
    const v: Version = {
      id: `v-${s.id}-1`,
      slotId: s.id,
      componentId: s.componentId,
      params: s.params,
      source: 'user',
      costCredits: 0,
      createdAt: now,
      label: 'v1',
    };
    versions.push(v);
    return { ...s, currentVersionId: v.id };
  });
  return { slots: out, versions };
}

/** Reels cut tighter than voiceovers: pauses over 0.5 s keep 0.24 s of air (spec 25). */
const REEL_EDL = { pauseMs: 500, keepMs: 240 } as const;

function titleFrom(name: string): string {
  const base = name.replace(/\.[a-z0-9]{2,5}$/i, '').trim();
  return base.length > 0 ? base.slice(0, 80) : 'Untitled Project';
}

/**
 * Voiceover → editor project (spec 05). Emits step events as it goes; nothing is written
 * until the final store step, and a failed store removes what it already wrote, so a cancel
 * or a failure never leaves half a project behind.
 */
/** The one slot of a single graphic: every typed word, the type its words call for. */
export function singleSuggestion(words: readonly Word[]): SlotSuggestion {
  const text = words.map((w) => w.text);
  return {
    wordStart: 0,
    wordEnd: Math.max(0, words.length - 1),
    componentId: graphicForWords(text),
    skillId: 'manual',
    reason: `You wrote “${text.join(' ')}”`,
    score: 1,
    params: {},
  };
}

export async function runPipeline(
  input: PipelineInput,
  deps: PipelineDeps,
  onEvent: (e: PipelineEvent) => void,
  signal?: AbortSignal,
): Promise<{ projectId: string }> {
  let step: PipelineStep | 'intake' = 'intake';
  const checkAbort = () => {
    if (signal?.aborted) throw new DOMException('Processing was cancelled', 'AbortError');
  };
  const fail = (message: string): never => {
    throw new PipelineError(step, message);
  };
  // Problems with the file itself, found while decoding, are intake errors (R1.2).
  const rejectFile = (message: string): never => {
    throw new PipelineError('intake', message);
  };

  try {
    // The project id comes first, so every write of this run can be filed under it (design §2.4).
    const id = deps.newId();
    const cleanupOn = input.cleanup ?? true;

    // Intake (R1).
    const intake = validateIntake({
      name: input.name,
      type: input.file.type,
      size: input.file.size,
    });
    if (!intake.ok) return rejectFile(intake.message);
    const isVideoInput = intake.kind === 'video';
    // Video uploads default to crisp Studio Light (spec 24 R5.2) unless the creator picked another look.
    const styleId = input.styleId ?? (isVideoInput ? 'studio-light' : deps.styleId);

    step = 'transcribe';
    onEvent({ type: 'step', step, state: 'active' });
    let audio: DecodedAudio;
    try {
      audio = await deps.decode(input.file);
    } catch {
      return rejectFile("I couldn't read that file. Try MP3, WAV or M4A.");
    }
    checkAbort();
    const duration = checkDuration(audio.durationMs);
    if (!duration.ok) {
      rejectFile(duration.message);
    }
    if (!input.single && isSilent(audio.pcm16k)) {
      rejectFile("I couldn't hear anything in that file.");
    }

    // Transcribe (R2).
    const t: TranscribeOutput = input.words
      ? { words: input.words, ranOn: 'device', timingQuality: 'word' }
      : await deps.transcribe(audio.pcm16k, audio.durationMs, (p) =>
          onEvent({ type: 'progress', step: 'transcribe', ...p }),
        );
    checkAbort();
    if (t.words.length === 0) fail('No words found');
    onEvent({ type: 'words', words: t.words, durationMs: audio.durationMs });
    onEvent({
      type: 'step',
      step,
      state: 'done',
      detail:
        (input.words ? 'Sample transcript · ' : '') +
        transcriptSummary(t.words.length, audio.durationMs),
    });

    // Talking-head video (spec 25): jump cuts on the pauses and fillers, then a template reel.
    if (isVideoInput && !input.single) {
      step = 'clean';
      onEvent({ type: 'step', step, state: 'active' });
      const probe = deps.probeVideo ? await deps.probeVideo(input.file).catch(() => null) : null;
      checkAbort();
      const sourceMs = Math.max(1, probe?.durationMs ?? audio.durationMs);
      const reelEdl = cleanupOn
        ? buildEdl(t.words, audio.durationMs, REEL_EDL)
        : { cuts: [], fillersRemoved: 0, pausesShortened: 0, skipped: undefined };
      const videoCuts: VideoCut[] = reelEdl.cuts
        .map((c) => ({
          startMs: Math.round(c.startMs),
          endMs: Math.round(Math.min(c.endMs, sourceMs)),
        }))
        .filter((c) => c.endMs > c.startMs)
        .map((c, i) => ({
          id: `cut-${i + 1}`,
          ...c,
          kind: 'silence' as const,
          reason: 'Pause or filler',
          enabled: true,
        }));
      const kept = keptSourceSegments(sourceMs, videoCuts);
      const reelMs = Math.max(1, cleanedDurationFromSegments(kept));
      const reelWords = retimeWords(t.words, videoCuts);
      const reelPcm =
        videoCuts.length > 0
          ? await deps.renderCleaned(audio.pcm24k, OUTPUT_SAMPLE_RATE, videoCuts)
          : null;
      checkAbort();
      onEvent({ type: 'words', words: reelWords, durationMs: reelMs });
      onEvent({
        type: 'step',
        step,
        state: 'done',
        detail: !cleanupOn
          ? 'Cleanup is off'
          : cleanupSummary(reelEdl.fillersRemoved, reelEdl.pausesShortened),
      });
      onEvent({ type: 'step', step: 'moments', state: 'skipped', detail: 'Reels skip this' });
      onEvent({ type: 'step', step: 'suggest', state: 'skipped', detail: 'Reels skip this' });

      step = 'plan';
      onEvent({ type: 'step', step, state: 'active', detail: 'Directing your reel' });
      const look: ReelLook = input.reelLook ?? 'mono';
      const words = reelWords.map((w) => ({ text: w.text, startMs: w.startMs, endMs: w.endMs }));
      const directed = await (deps.directReel
        ? deps.directReel({ look, words, durationMs: reelMs }).catch(() => null)
        : Promise.resolve(null));
      checkAbort();
      const reel = directed?.plan ?? autoReelPlan(words, reelMs, look);
      const source = directed?.source ?? 'auto';

      checkAbort();
      const written: string[] = [];
      try {
        const place = { projectId: id, kind: 'voice' } as const;
        const reuse = input.storedRef && !deps.audioStore.syncs?.() ? input.storedRef : null;
        const originalSrc = reuse ?? (await deps.audioStore.put(input.file, place));
        if (!reuse) written.push(originalSrc);
        const src = reelPcm
          ? await deps.audioStore.put(
              new Blob([deps.encodeWav(reelPcm, OUTPUT_SAMPLE_RATE)], { type: 'audio/wav' }),
              place,
            )
          : originalSrc;
        if (src !== originalSrc) written.push(src);
        const now = deps.now();
        const transcript = (ws: Word[], cleaned: boolean): Transcript => ({
          words: ws,
          language: 'en',
          ranOn: t.ranOn,
          timingQuality: t.timingQuality,
          cleaned,
        });
        const candidate = {
          schemaVersion: 1,
          id,
          title: input.title?.trim().slice(0, 80) || titleFrom(input.name),
          format: '9:16',
          fps: 30,
          styleId,
          durationMs: reelMs,
          voiceover: {
            src,
            durationMs: reelMs,
            source: input.source,
            originalSrc,
            originalDurationMs: audio.durationMs,
            cleanup: {
              fillersRemoved: reelEdl.fillersRemoved,
              pausesShortened: reelEdl.pausesShortened,
              enabled: videoCuts.length > 0,
              ...(reelEdl.skipped ? { skipped: reelEdl.skipped } : {}),
            },
          },
          video: {
            src: originalSrc,
            width: probe?.width ?? 1080,
            height: probe?.height ?? 1920,
            originalDurationMs: sourceMs,
            cuts: videoCuts,
            punchIns: [],
            defaultOverlayAnchor: 'top-right',
          },
          reel,
          transcript: transcript(reelWords, videoCuts.length > 0),
          originalTranscript: transcript(t.words, false),
          slots: [],
          versions: [],
          // The reel draws its own captions (spec 25); the slot captions stay off.
          captions: { ...DEFAULT_CAPTIONS, enabled: false },
          createdAt: now,
          updatedAt: now,
        } satisfies EditorProject;
        const project: EditorProject = EditorProjectSchema.parse(candidate);
        await deps.repo.save(project);
        if (input.storedRef && !reuse && input.storedRef !== originalSrc) {
          await deps.audioStore.delete(input.storedRef).catch(() => undefined);
        }
        onEvent({
          type: 'step',
          step,
          state: 'done',
          detail: `${reel.scenes.length} scenes${source === 'cloud' ? '' : ' · free director'}`,
          ...(source === 'cloud' ? { route: 'cloud' as const } : {}),
        });
        onEvent({ type: 'done', projectId: id });
        return { projectId: id };
      } catch (err) {
        await Promise.all(written.map((ref) => deps.audioStore.delete(ref).catch(() => undefined)));
        throw err instanceof PipelineError
          ? err
          : new PipelineError(step, "Couldn't save the project in this browser.", { cause: err });
      }
    }

    // Clean (R3) + Video editorial directing (spec 18 R4).
    step = 'clean';
    onEvent({ type: 'step', step, state: 'active' });
    let videoProbe: VideoProbeResult | null = null;
    if (isVideoInput && deps.probeVideo) {
      videoProbe = await deps.probeVideo(input.file).catch(() => null);
      checkAbort();
    }
    const targetFormat: Format = input.format ?? videoProbe?.format ?? '16:9';

    const edl = cleanupOn
      ? buildEdl(t.words, audio.durationMs)
      : { cuts: [], fillersRemoved: 0, pausesShortened: 0, skipped: undefined };

    let videoPlan: EnforcedVideoPlan | null = null;
    if (isVideoInput && deps.directVideo) {
      onEvent({
        type: 'step',
        step,
        state: 'active',
        detail: 'Analyzing video & cuts with Gemini 4 Neon…',
        route: 'cloud',
      });
      videoPlan = await deps
        .directVideo({
          format: targetFormat,
          styleId,
          durationMs: videoProbe?.durationMs ?? audio.durationMs,
          words: t.words,
          frames: videoProbe?.frames ?? [],
          audioEdlCuts: edl.cuts.map((c) => ({ startMs: c.startMs, endMs: c.endMs })),
        })
        .catch(() => null);
      checkAbort();
    }

    const cuts = videoPlan
      ? videoPlan.cuts.filter((c) => c.enabled).map((c) => ({ startMs: c.startMs, endMs: c.endMs }))
      : edl.cuts;
    const cleanedMs = videoPlan
      ? Math.max(
          1,
          cleanedDurationFromSegments(keptSourceSegments(audio.durationMs, videoPlan.cuts)),
        )
      : cleanedDuration(audio.durationMs, cuts);
    const cleanedWords = retimeWords(t.words, cuts);
    const cleanedPcm =
      cuts.length > 0 ? await deps.renderCleaned(audio.pcm24k, OUTPUT_SAMPLE_RATE, cuts) : null;
    checkAbort();
    onEvent({ type: 'words', words: cleanedWords, durationMs: cleanedMs });
    const enabledVideoCuts = videoPlan ? videoPlan.cuts.filter((c) => c.enabled).length : 0;
    onEvent({
      type: 'step',
      step,
      state: 'done',
      detail: videoPlan
        ? `${enabledVideoCuts} ${enabledVideoCuts === 1 ? 'cut' : 'cuts'} · ${videoPlan.punchIns.length} punch-ins`
        : !cleanupOn
          ? input.source === 'tts'
            ? 'Skipped for generated voices'
            : 'Cleanup is off'
          : edl.skipped
            ? 'Kept your audio as it is'
            : cleanupSummary(edl.fillersRemoved, edl.pausesShortened),
    });

    // Moments (spec 06 R1): the deterministic tagger on the cleaned words.
    step = 'moments';
    onEvent({ type: 'step', step, state: 'active' });
    const spans = tagSpans(cleanedWords);
    // Delivery analysis on the cleaned audio (spec 07 R9.1): on-device, no AI. Optional: a
    // failure here must never stop processing.
    let delivery: Prosody | undefined;
    try {
      delivery = analyseProsody(cleanedPcm ?? audio.pcm24k, OUTPUT_SAMPLE_RATE, cleanedWords);
    } catch {
      delivery = undefined;
    }
    onEvent({
      type: 'step',
      step,
      state: 'done',
      detail: momentsSummary(spans.length, delivery ? stressedCount(delivery) : 0),
    });

    // Suggest (spec 06 R2-R3): detect, then the post-pass makes them timeline-valid.
    step = 'suggest';
    onEvent({ type: 'step', step, state: 'active' });
    const suggestions = input.single
      ? [singleSuggestion(cleanedWords)]
      : await deps.detect(cleanedWords, spans);
    checkAbort();
    const placed = postPass({
      words: cleanedWords,
      suggestions,
      validate: deps.validateParams,
    });
    onEvent({ type: 'slots', slots: placed });
    onEvent({ type: 'step', step, state: 'done', detail: slotsSummary(placed.length) });

    // Plan (spec 07 R6.1): one call plans the whole video, on the device first. Free, and it
    // never stops processing: any failure plans with the built-in rules.
    step = 'plan';
    onEvent({ type: 'step', step, state: 'active', detail: 'Device first', route: 'device' });
    const style = styleFor({ styleId });
    const req = directorRequest({
      slots: placed,
      suggestions,
      transcript: { words: cleanedWords, ...(delivery ? { prosody: delivery } : {}) },
      spans,
      style,
      energy: (style as Look).energy ?? 'steady',
      imagesMax: deps.imagesMax ?? APP_CONFIG_DEFAULTS.imagesPerVideoMax,
    });
    let slots = placed;
    let planned: { detail: string; route?: 'device' | 'cloud' } = { detail: 'Nothing to plan' };
    if (req) {
      const r = await (deps.direct ?? rulesOnly)(req).catch(() => rulesOnly(req));
      checkAbort();
      slots = applyPlan(placed, req.indices, r.plan);
      const peak = slots[req.indices[r.plan.peak] ?? -1];
      planned = {
        detail: planSummary(r, peak?.startMs),
        ...(r.source === 'rules' ? {} : { route: r.source }),
      };
    }

    // Assign overlay vs cutaway placement on slots for video projects (spec 18 R4.2).
    if (isVideoInput) {
      const defaultAnchor: OverlayAnchor = videoPlan?.defaultOverlayAnchor ?? 'top-right';
      const CUTAWAY_TYPES = new Set(['map-zoom', 'chart-story', 'timeline']);
      slots = slots.map((slot) => {
        const hint = videoPlan?.placements.find(
          (pl) => pl.startMs < slot.endMs && pl.endMs > slot.startMs,
        );
        const placement: SlotPlacement =
          hint?.placement ?? (CUTAWAY_TYPES.has(slot.componentId) ? 'cutaway' : 'overlay');
        const overlayAnchor: OverlayAnchor = hint?.anchor ?? defaultAnchor;
        return {
          ...slot,
          placement,
          ...(placement === 'overlay' ? { overlayAnchor } : {}),
        };
      });
    }

    // Store (spec 05 R4). Last chance to cancel before anything is written. A failure here
    // shows on the plan card, which stays active until the project is saved.
    checkAbort();
    const written: string[] = [];
    try {
      // Every ref is filed under the project (design §2.4). A stored take is reused as it is in
      // local mode; signed in, it is put again under the project so it uploads to the account.
      const place = { projectId: id, kind: 'voice' } as const;
      const reuse = input.storedRef && !deps.audioStore.syncs?.() ? input.storedRef : null;
      const originalSrc = reuse ?? (await deps.audioStore.put(input.file, place));
      if (!reuse) written.push(originalSrc);
      const src = cleanedPcm
        ? await deps.audioStore.put(
            new Blob([deps.encodeWav(cleanedPcm, OUTPUT_SAMPLE_RATE)], { type: 'audio/wav' }),
            place,
          )
        : originalSrc;
      if (src !== originalSrc) written.push(src);

      const videoTrack: VideoTrack | undefined = isVideoInput
        ? {
            src: originalSrc,
            width: videoProbe?.width ?? 1920,
            height: videoProbe?.height ?? 1080,
            originalDurationMs: Math.max(1, videoProbe?.durationMs ?? audio.durationMs),
            cuts: videoPlan?.cuts ?? [],
            punchIns: videoPlan?.punchIns ?? [],
            defaultOverlayAnchor: videoPlan?.defaultOverlayAnchor ?? 'top-right',
          }
        : undefined;

      const mediaBin: MediaClip[] = [];
      if (input.extraClips?.length && deps.ingestExtraClip) {
        for (const extra of input.extraClips.slice(0, 20)) {
          const clip = await deps.ingestExtraClip(extra, id).catch(() => null);
          if (clip) {
            mediaBin.push(clip);
            if (clip.src !== extra.ref) written.push(clip.src);
          }
        }
      }

      const now = deps.now();
      const transcript = (words: Word[], cleaned: boolean): Transcript => ({
        words,
        language: 'en',
        ranOn: t.ranOn,
        timingQuality: t.timingQuality,
        cleaned,
      });
      const candidate = {
        schemaVersion: 1,
        id,
        title: input.title?.trim().slice(0, 80) || titleFrom(input.name),
        format: targetFormat,
        fps: 30,
        styleId,
        durationMs: cleanedMs,
        voiceover: {
          src,
          durationMs: cleanedMs,
          source: input.source,
          originalSrc,
          originalDurationMs: audio.durationMs,
          cleanup: {
            fillersRemoved: edl.fillersRemoved,
            pausesShortened: edl.pausesShortened,
            enabled: cuts.length > 0,
            ...(edl.skipped ? { skipped: edl.skipped } : {}),
          },
          ...(input.tts ? { tts: input.tts } : {}),
        },
        ...(videoTrack ? { video: videoTrack } : {}),
        ...(mediaBin.length ? { mediaBin } : {}),
        transcript: {
          ...transcript(cleanedWords, cuts.length > 0),
          ...(delivery ? { prosody: delivery } : {}),
        },
        originalTranscript: transcript(t.words, false),
        ...firstVersions(slots, now),
        ...(input.single
          ? { captions: { ...DEFAULT_CAPTIONS, enabled: false } }
          : videoTrack
            ? {
                captions: { enabled: true, presetId: 'studio' },
                // Absent `musicId` = no background music bed (spec 24 R5.2 + MusicIdSchema).
                audio: {
                  ...DEFAULT_AUDIO,
                  musicGainDb: -22,
                  duckDepthDb: 10,
                  autoSfx: true,
                },
              }
            : {}),
        createdAt: now,
        updatedAt: now,
      } satisfies EditorProject;
      const project: EditorProject = EditorProjectSchema.parse(candidate);
      await deps.repo.save(project);
      if (videoTrack) markAutoChoreograph(id);
      // The project owns its own copy now; the hand-off's local take can go.
      if (input.storedRef && !reuse && input.storedRef !== originalSrc) {
        await deps.audioStore.delete(input.storedRef).catch(() => undefined);
      }
      onEvent({ type: 'step', step, state: 'done', ...planned });
      onEvent({ type: 'done', projectId: id });
      return { projectId: id };
    } catch (err) {
      await Promise.all(written.map((ref) => deps.audioStore.delete(ref).catch(() => undefined)));
      throw err instanceof PipelineError
        ? err
        : new PipelineError(step, "Couldn't save the project in this browser.", { cause: err });
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    const e =
      err instanceof PipelineError
        ? err
        : new PipelineError(step, err instanceof Error ? err.message : String(err));
    if (e.step !== 'intake')
      onEvent({ type: 'step', step: e.step, state: 'failed', detail: e.message });
    onEvent({ type: 'error', step: e.step, message: e.message });
    throw e;
  }
}
