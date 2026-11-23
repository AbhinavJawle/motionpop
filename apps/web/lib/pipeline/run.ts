import {
  applyEditChoices,
  autoReelPlan,
  briefFromEdit,
  builtInSkills,
  planVideo,
  postPass,
  tagSpans,
  type AudioEdlCutInput,
  type EditChoices,
  type EnforcedVideoPlan,
  type PlannedVideo,
  type ReelDirectBrief,
  type TaggedSpan,
  type ValidatedParams,
  styleFor as recipeStyleFor,
} from '@motionpop/ai';
import { looks, stylePacks } from '@motionpop/motion/styles';
import { markAutoChoreograph } from '@/lib/film/auto-choreograph';
import {
  APP_CONFIG_DEFAULTS,
  DEFAULT_AUDIO,
  DEFAULT_CAPTIONS,
  EditorProjectSchema,
  cleanedDurationFromSegments,
  keptSourceSegments,
  sourceToCleanedMs,
  reelMediaKey,
  reelMediaOf,
  type CaptionsSetting,
  type EditConfig,
  type EditorProject,
  type ImageAsset,
  type Format,
  type Look,
  type MediaClip,
  type OverlayAnchor,
  type PendingExtraClip,
  type ReelCaptionStyle,
  type ReelLook,
  type ReelPlan,
  type ReelTheme,
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
import { planAutoCuts, spokenWords, type AutoCutPlan } from '../audio/autocut';
import {
  applyReview,
  findRetakes,
  phrasesOf,
  reviewPhrases,
  type EditReview,
} from '../audio/retakes';
import { speechMap } from '../audio/speech';
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

/**
 * Results of paid steps a failed run already holds (spec 39 design §10 #2). A retry hands them back
 * so it never pays for the same step twice: the run uses them instead of calling the dep.
 */
export interface PipelineReuse {
  /** The directed reel (cloud only: the free plan costs nothing to make again). */
  reel?: { plan: ReelPlan; source: 'cloud' | 'auto'; error?: string };
  /** The pictures, with the plan they were found for (used only when the plan still asks for them). */
  media?: { plan: ReelPlan; assets: ImageAsset[] };
  /** The generated soundtrack (its `music.src`). */
  music?: ReelPlan;
}

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
  /**
   * The creator's choices from the configure screen (spec 39 R2.10, R5.5). Absent: the pipeline
   * behaves as it did before spec 39. A single graphic ignores it.
   */
  edit?: EditConfig;
  /** Paid results from an earlier run of the same job (retry). */
  reuse?: PipelineReuse;
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
    /** Keyframes of the footage on the reel clock (spec 27 R2.1). */
    frames?: readonly { atMs: number; base64: string }[];
    /** The creator's recipe and choices as text for the director (spec 39 R3.5). */
    brief?: ReelDirectBrief;
    /** The creator's choices, enforced on the plan from either director (spec 39 R5.7). */
    choices?: EditChoices;
    /** Fires when the job is cancelled: a charge made by this call is handed back (R6.9). */
    signal?: AbortSignal;
  }): Promise<{ plan: ReelPlan; source: 'cloud' | 'auto'; error?: string }>;
  /**
   * The cloud editor's review of the automatic retake cuts (spec 28 R3). Optional; without it
   * (or on failure) the rule-based edit stands.
   */
  reviewEdit?(params: { phrases: [number, string, boolean][] }): Promise<EditReview | null>;
  /**
   * Generates and stores the reel's music from the director's brief (spec 27 R3.2). Optional;
   * without it (or on failure) the reel plays with its sound effects only.
   */
  resolveReelMusic?(params: {
    plan: ReelPlan;
    durationMs: number;
    projectId: string;
    signal?: AbortSignal;
  }): Promise<ReelPlan>;
  /**
   * Fetches the pictures a reel plan asks for (spec 26: logos, illustrations, photos, site
   * screenshots) and stores them as project assets. Optional; without it the templates draw
   * their fallbacks.
   */
  resolveReelMedia?(params: {
    plan: ReelPlan;
    look: ReelLook;
    projectId: string;
    onProgress?: (done: number, total: number) => void;
    /** Most AI illustrations to make (spec 39 R2.7: 0 when the creator switched them off). */
    maxIllustrations?: number;
    /** Fires when the job is cancelled: illustrations charged by this call are handed back. */
    signal?: AbortSignal;
  }): Promise<{ plan: ReelPlan; assets: ImageAsset[] }>;
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

/** Reel caption style → the voiceover caption preset that looks closest (spec 39 §5.4). */
const CAPTION_PRESET: Readonly<Record<ReelCaptionStyle, CaptionsSetting['presetId']>> = {
  seam: 'studio',
  pop: 'pop',
  editorial: 'editorial',
  boxed: 'boxed',
  clean: 'clean',
};

/** The built-in recipe an edit stands on (a described recipe borrows its resolved base). */
function recipeOf(edit: EditConfig) {
  const id =
    edit.recipeId === 'custom' ? (edit.resolved?.recipeId ?? 'tech-explainer') : edit.recipeId;
  return builtInSkills.recipe(id);
}

/** The look and colours a reel gets from the creator's style (spec 39 review 18, 24). */
function reelStyleOf(edit: EditConfig): { look: ReelLook; theme?: ReelTheme } {
  if (edit.recipeId === 'custom' && edit.resolved) {
    return {
      look: edit.resolved.look,
      ...(edit.resolved.theme ? { theme: edit.resolved.theme } : {}),
    };
  }
  const style = recipeStyleFor(edit.recipeId, edit.styleId);
  return { look: style.look, ...(style.theme ? { theme: style.theme } : {}) };
}

/**
 * The voiceover look for an edit: the chosen style when it is a real voiceover look, else the
 * recipe's own (a reel style id is not a voiceover look).
 */
function voiceoverLookOf(edit: EditConfig, fallback: string): string {
  if (Object.hasOwn(looks, edit.styleId) || Object.hasOwn(stylePacks, edit.styleId))
    return edit.styleId;
  return recipeOf(edit)?.defaults.voiceoverLook ?? fallback;
}

/** Music mood → the synthesised bed a voiceover can play (spec 39 §5.4); `none`/unknown → none. */
function musicIdOf(edit: EditConfig): 'calm-pad' | 'steady-pulse' | undefined {
  const mood =
    edit.sound.music === 'auto' ? (recipeOf(edit)?.defaults.music ?? 'none') : edit.sound.music;
  if (mood === 'minimal-tech' || mood === 'lofi') return 'calm-pad';
  if (mood === 'upbeat' || mood === 'dramatic') return 'steady-pulse';
  return undefined;
}

/** True when both plans ask for the same pictures (a held result still fits the plan). */
function asksForSameMedia(held: ReelPlan, now: ReelPlan): boolean {
  const keys = (p: ReelPlan) => reelMediaOf(p).map(reelMediaKey).sort().join('\n');
  return held.scenes.length === now.scenes.length && keys(held) === keys(now);
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
    // A single graphic has nothing to choose, so it ignores the configure choices (spec 39).
    const edit = input.single ? undefined : input.edit;
    // Generated voices are already clean: `tts` forces cleanup off (spec 39 review 25).
    const cleanupOn = edit ? input.source !== 'tts' && edit.sound.cleanup : (input.cleanup ?? true);

    // Intake (R1).
    const intake = validateIntake({
      name: input.name,
      type: input.file.type,
      size: input.file.size,
    });
    if (!intake.ok) return rejectFile(intake.message);
    const isVideoInput = intake.kind === 'video';
    if (isVideoInput && !input.single) onEvent({ type: 'titles', titles: REEL_STEP_TITLES });
    // Video uploads default to crisp Studio Light (spec 24 R5.2) unless the creator picked another look.
    const styleId =
      edit && !isVideoInput
        ? voiceoverLookOf(edit, deps.styleId)
        : (input.styleId ?? (isVideoInput ? 'studio-light' : deps.styleId));

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

    // The speech meter reads the PCM before transcription: a transcriber may take the buffer
    // (the Whisper worker transfers it), leaving an empty array behind (spec 28 R1).
    const measured =
      isVideoInput && !input.single && cleanupOn ? speechMap(audio.pcm16k, 16_000) : null;

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

    // Talking-head video (spec 25): the automatic edit (spec 28), then a template reel.
    if (isVideoInput && !input.single) {
      step = 'clean';
      onEvent({ type: 'step', step, state: 'active', detail: 'Measuring your speech' });
      const probe = deps.probeVideo ? await deps.probeVideo(input.file).catch(() => null) : null;
      checkAbort();
      const sourceMs = Math.max(1, probe?.durationMs ?? audio.durationMs);
      // Spec 28: pauses are cut where the audio is silent (not where Whisper's words end),
      // retakes are found by the rules and double-checked by the cloud editor.
      const map = measured;
      // Cuts are planned over the longer of the two clocks: a video that runs past its audio
      // gets its silent tail cut too, so the voice and the reel end together (spec 28 review).
      const editMs = Math.max(audio.durationMs, sourceMs);
      const spoken = spokenWords(t.words, map);
      let retakes = cleanupOn ? findRetakes(spoken) : [];
      const firstPass = cleanupOn
        ? planAutoCuts({ words: t.words, durationMs: editMs, speech: map, retakes })
        : null;
      onEvent({
        type: 'step',
        step,
        state: 'done',
        detail: !cleanupOn ? 'Cleanup is off' : pauseSummary(firstPass!.stats),
      });

      step = 'moments';
      onEvent({
        type: 'step',
        step,
        state: 'active',
        detail: 'Looking for repeated takes',
        ...(cleanupOn && deps.reviewEdit ? { route: 'cloud' as const } : {}),
      });
      let reviewed = false;
      if (cleanupOn && deps.reviewEdit) {
        const phrases = phrasesOf(spoken);
        // Cancel never waits on the cloud: an abort settles the wait at once (the rules stand).
        const review = await Promise.race([
          deps.reviewEdit({ phrases: reviewPhrases(spoken, phrases, retakes) }).catch(() => null),
          new Promise<null>((resolve) => {
            if (signal?.aborted) resolve(null);
            signal?.addEventListener('abort', () => resolve(null), { once: true });
          }),
        ]);
        checkAbort();
        if (review) {
          retakes = applyReview(spoken, phrases, retakes, review);
          reviewed = true;
        }
      }
      const auto = cleanupOn
        ? planAutoCuts({ words: t.words, durationMs: editMs, speech: map, retakes })
        : null;
      const videoCuts: VideoCut[] = (auto?.cuts ?? [])
        .map((c) => ({
          ...c,
          startMs: Math.round(c.startMs),
          endMs: Math.round(Math.min(c.endMs, sourceMs)),
        }))
        .filter((c) => c.endMs > c.startMs)
        .map((c, i) => ({
          id: `cut-${i + 1}`,
          startMs: c.startMs,
          endMs: c.endMs,
          kind: c.kind,
          reason: c.reason.slice(0, 160),
          enabled: true,
        }));
      const kept = keptSourceSegments(sourceMs, videoCuts);
      const reelMs = Math.max(1, cleanedDurationFromSegments(kept));
      // Source-clock words with tightened timings: the editor re-times them when cuts change.
      const sourceWords = auto?.words ?? t.words;
      const reelWords = retimeWords(sourceWords, videoCuts);
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
          : retakeSummary(auto!.stats, reviewed, audio.durationMs, reelMs),
      });

      step = 'suggest';
      onEvent({
        type: 'step',
        step,
        state: 'active',
        detail: 'Writing the story',
        ...(deps.directReel ? { route: 'cloud' as const } : {}),
      });
      // The creator's style decides the look before the director runs (spec 39 review 18).
      const editStyle = edit ? reelStyleOf(edit) : null;
      const look: ReelLook = editStyle?.look ?? input.reelLook ?? 'mono';
      const choices: EditChoices | null = edit
        ? {
            hookStyle: edit.hookStyle,
            captions: edit.captions,
            cta: edit.cta,
            music: edit.sound.music,
            ...(editStyle?.theme ? { theme: editStyle.theme } : {}),
          }
        : null;
      const words = reelWords.map((w) => ({ text: w.text, startMs: w.startMs, endMs: w.endMs }));
      // The director sees the footage too (spec 27 R2.1): keyframes moved onto the reel clock
      // (a frame inside a removed pause is dropped).
      const frames = (probe?.frames ?? []).flatMap((f) => {
        const atMs = sourceToCleanedMs(f.atMs, kept);
        return atMs === null ? [] : [{ atMs: Math.round(atMs), base64: f.base64 }];
      });
      // A paid plan from an earlier run of this job is used as it is (retry never pays twice).
      const directed =
        input.reuse?.reel ??
        (await (deps.directReel
          ? deps
              .directReel({
                look,
                words,
                durationMs: reelMs,
                frames,
                ...(edit && choices ? { brief: briefFromEdit(edit) ?? undefined, choices } : {}),
                ...(signal ? { signal } : {}),
              })
              .catch(() => null)
          : Promise.resolve(null)));
      checkAbort();
      // A director's plan already carries the choices (directReel enforces them, spec 39 R5.7);
      // the plan this file makes itself gets them here.
      let reel =
        directed?.plan ?? withChoices(autoReelPlan(words, reelMs, look), words, reelMs, choices);
      const source = directed?.source ?? 'auto';
      onEvent({
        type: 'step',
        step,
        state: 'done',
        detail: `${reel.scenes.length} scenes${source === 'cloud' ? '' : ' · free director'}`,
      });
      step = 'plan';
      onEvent({ type: 'step', step, state: 'active', detail: 'Getting the visuals ready' });
      // The pictures the plan asks for (spec 26). A failure keeps the plan: every media
      // template has a designed fallback.
      let reelAssets: ImageAsset[] = [];
      if (deps.resolveReelMedia && reelMediaOf(reel).length > 0) {
        onEvent({ type: 'step', step, state: 'active', detail: 'Finding logos and pictures' });
        const held = input.reuse?.media;
        const media =
          held && asksForSameMedia(held.plan, reel)
            ? held
            : await deps
                .resolveReelMedia({
                  plan: reel,
                  look,
                  projectId: id,
                  ...(edit ? { maxIllustrations: edit.illustrations === false ? 0 : 3 } : {}),
                  onProgress: (done, total) =>
                    onEvent({
                      type: 'step',
                      step: 'plan',
                      state: 'active',
                      detail: `Finding logos and pictures (${done}/${total})`,
                    }),
                  ...(signal ? { signal } : {}),
                })
                .catch(() => null);
        checkAbort();
        if (media) {
          reel = media.plan;
          reelAssets = media.assets;
        }
      }
      // The soundtrack (spec 27 R3.2), composed from the director's brief.
      if (deps.resolveReelMusic && reel.music && !reel.music.src && edit?.sound.music !== 'none') {
        onEvent({ type: 'step', step, state: 'active', detail: 'Composing your music' });
        const heldSrc = input.reuse?.music?.music?.src;
        const scored = heldSrc
          ? { ...reel, music: { ...reel.music, src: heldSrc } }
          : await deps
              .resolveReelMusic({
                plan: reel,
                durationMs: reelMs,
                projectId: id,
                ...(signal ? { signal } : {}),
              })
              .catch(() => null);
        checkAbort();
        if (scored) reel = scored;
      }

      checkAbort();
      const written: string[] = [];
      try {
        const place = { projectId: id, kind: 'voice' } as const;
        const reuse = input.storedRef && !deps.audioStore.syncs?.() ? input.storedRef : null;
        const originalSrc = reuse ?? (await deps.audioStore.put(input.file, place));
        if (!reuse) written.push(originalSrc);
        // The voice is always its own WAV (the editor's clock and the export's voice upload),
        // even without cuts: the original is a video file.
        const src = await deps.audioStore.put(
          new Blob([deps.encodeWav(reelPcm ?? audio.pcm24k, OUTPUT_SAMPLE_RATE)], {
            type: 'audio/wav',
          }),
          place,
        );
        written.push(src);
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
              fillersRemoved: auto?.stats.fillers ?? 0,
              pausesShortened: auto?.stats.pauses ?? 0,
              enabled: videoCuts.length > 0,
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
          ...(reelAssets.length ? { assets: reelAssets } : {}),
          transcript: transcript(reelWords, videoCuts.length > 0),
          originalTranscript: transcript(sourceWords, false),
          slots: [],
          versions: [],
          // The reel draws its own captions (spec 25); the slot captions stay off.
          captions: { ...DEFAULT_CAPTIONS, enabled: false },
          // The reel's own sound comes from `reel.music` and `reelBedSound`; no synth music here.
          ...(edit ? { audio: { ...DEFAULT_AUDIO, autoSfx: edit.sound.sfx }, edit } : {}),
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
          detail: visualsSummary(reelAssets.length, Boolean(reel.music?.src)),
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
            : edit
              ? {
                  // A voiceover with the creator's choices (spec 39 §5.4).
                  captions: {
                    enabled: edit.captions.enabled,
                    presetId: CAPTION_PRESET[edit.captions.style],
                  },
                  audio: {
                    ...DEFAULT_AUDIO,
                    autoSfx: edit.sound.sfx,
                    ...(musicIdOf(edit) ? { musicId: musicIdOf(edit) } : {}),
                  },
                  edit,
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

/** What each processing step does for a talking-head reel (spec 28 R4). */
export const REEL_STEP_TITLES = {
  clean: 'Cutting dead air',
  moments: 'Removing retakes',
  suggest: 'Directing the reel',
  plan: 'Adding visuals and music',
} as const;

/** "7 pauses · 30.0 s of dead air cut" (spec 28 R4). */
function pauseSummary(st: AutoCutPlan['stats']): string {
  if (st.pauseMs < 100) return 'No dead air';
  const n = st.pauses;
  return `${n} pause${n === 1 ? '' : 's'} · ${(st.pauseMs / 1000).toFixed(1)} s of dead air cut`;
}

/** "3 retakes cut · 89.6 s → 36.7 s" (spec 28 R4). */
function retakeSummary(
  st: AutoCutPlan['stats'],
  reviewed: boolean,
  sourceMs: number,
  finalMs: number,
): string {
  const n = st.retakes;
  const takes = st.retakesSkipped
    ? 'Retakes left in (too much would go)'
    : n === 0
      ? 'No retakes'
      : `${n} retake${n === 1 ? '' : 's'} cut`;
  const span = `${(sourceMs / 1000).toFixed(1)} s → ${(finalMs / 1000).toFixed(1)} s`;
  return `${takes}${reviewed ? ' · checked' : ''} · ${span}`;
}

/** The creator's choices on a plan this file made itself; the plan stands if they can't apply. */
function withChoices(
  plan: ReelPlan,
  words: readonly ReelWord[],
  durationMs: number,
  choices: EditChoices | null,
): ReelPlan {
  if (!choices) return plan;
  try {
    return applyEditChoices(plan, words, durationMs, choices);
  } catch {
    return plan;
  }
}

function visualsSummary(images: number, music: boolean): string {
  const parts = [images > 0 ? `${images} visual${images === 1 ? '' : 's'}` : 'Graphics ready'];
  if (music) parts.push('music composed');
  return parts.join(' · ');
}
