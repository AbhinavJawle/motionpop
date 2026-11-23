import { ImageAssetSchema } from './asset';
import { BrandSchema } from './brand';
import { ProjectFilmSchema } from './film';
import { z } from 'zod';
import { FormatSchema } from './format';
import { ReelPlanSchema } from './reel';
import { EnergySchema } from './score';
import { SCRIPT_MAX_CHARS } from './start';
import { TranscriptSchema } from './transcript';
import {
  BeatArchetypeSchema,
  MediaClipSchema,
  OverlayAnchorSchema,
  SlotPlacementSchema,
  VideoStageModeSchema,
  VideoTrackSchema,
} from './video';

/** Families a project may pick in the Fonts panel (every one is bundled in packages/motion, OFL). */
export const FONT_CHOICES = [
  'Geist',
  'Fraunces',
  'Space Grotesk',
  'Bricolage Grotesque',
  'Playfair Display',
] as const;
export type FontChoice = (typeof FONT_CHOICES)[number];

/** Integer milliseconds, never negative (architecture.md: no float seconds). */
export const IntMsSchema = z.number().int().nonnegative();

export const SlotStatusSchema = z.enum(['suggested', 'generating', 'ready', 'failed']);
export type SlotStatus = z.infer<typeof SlotStatusSchema>;

/** Per-slot timing overrides (component-library.md "timing"). Stored on the slot, not in params (D-037). */
export const SlotTimingSchema = z.object({
  speed: z
    .number()
    .min(0.5)
    .max(2)
    .optional()
    .describe(
      'Speed of entrances and exits. 0.8 = slower, 1.25 = faster. Landings stay on the spoken word',
    ),
  ease: z.enum(['inOut', 'out', 'linear']).optional().describe('Main ease of the motion'),
  fade: z
    .boolean()
    .optional()
    .describe('false = hold the last frame and cut at the end of the slot'),
});
export type SlotTiming = z.infer<typeof SlotTimingSchema>;

/** At most this many versions are kept per slot; the oldest non-current one is dropped first. */
export const VERSIONS_PER_SLOT = 20;

/**
 * A note drawn on the frame (spec 09). Shape semantics, checked by the note commands and not
 * here, so loading a saved project never fails because of a limit (D-049):
 * - `circle`: points = [cx, cy, rx, ry] in 0..1 of the frame; a 3-value [cx, cy, r] means rx = ry = r.
 * - `path`: points = [x1, y1, x2, y2, …] in 0..1, an even count of 4..128 values.
 * `tMs` is **relative to the slot start**, so a note moves with its slot (D-048): the one relative
 * time in a project that otherwise stores absolute milliseconds.
 */
export const FrameNoteSchema = z.object({
  id: z.string().min(1),
  tMs: IntMsSchema,
  shape: z.object({
    kind: z.enum(['circle', 'path']),
    points: z.array(z.number()),
  }),
  text: z.string(),
  status: z.enum(['open', 'fixed']),
  /** The version the note's fix created (set when the note is marked fixed). */
  fixedVersionId: z.string().min(1).optional(),
});
export type FrameNote = z.infer<typeof FrameNoteSchema>;

/**
 * A single slot. Duration limits ([1000, 12000] ms, narrowed per component) are
 * enforced by commands (spec 04 task 3), not here, so loading a saved project never
 * fails because of a limit. The schema only checks what makes the data unusable.
 */
export const SlotSchema = z
  .object({
    id: z.string().min(1),
    startMs: IntMsSchema,
    endMs: IntMsSchema,
    wordStart: z.number().int().nonnegative(),
    wordEnd: z.number().int().nonnegative(),
    reason: z.string(),
    /** A library component id, or "custom" for tier-2. */
    componentId: z.string().min(1),
    skillId: z.string().min(1),
    /** Slot-level style override. */
    styleId: z.string().min(1).optional(),
    prompt: z.string(),
    params: z.record(z.string(), z.unknown()),
    status: SlotStatusSchema,
    error: z.string().optional(),
    needsInput: z.array(z.string()).optional(),
    currentVersionId: z.string().min(1).optional(),
    notes: z.array(FrameNoteSchema).default([]),
    sfx: z.array(z.object({ id: z.string().min(1), atMs: IntMsSchema })).optional(),
    /** Scenes: this slot's energy from the director's curve (spec 07 R6.1); else the project's. */
    energy: EnergySchema.optional(),
    /** Timing overrides (speed, ease, fade). Unset keys mean the look's defaults; never an empty object. */
    timing: SlotTimingSchema.optional(),
    /** Video projects (spec 18): full-screen cutaway or a card over the speaker. Absent means cutaway. */
    placement: SlotPlacementSchema.optional(),
    /** Video projects (spec 18): where an overlay card sits. Absent means the video's default anchor. */
    overlayAnchor: OverlayAnchorSchema.optional(),
    /** Coupled choreography stage mode for this beat on video projects (spec 19 + 20). */
    videoStage: VideoStageModeSchema.optional(),
    /** Visual archetype assigned by the Director for this beat (spec 19). */
    archetype: BeatArchetypeSchema.optional(),
    /** Optional Media Bin clip bound to this beat (spec 20). */
    clipId: z.string().min(1).max(64).optional(),
    clipStartMs: IntMsSchema.optional(),
    clipEndMs: IntMsSchema.optional(),
    clipFocusX: z.number().min(0).max(1).optional(),
    clipFocusY: z.number().min(0).max(1).optional(),
    clipZoom: z.number().min(1).max(2.4).optional(),
  })
  .refine((s) => s.endMs > s.startMs, {
    message: 'endMs must be greater than startMs',
    path: ['endMs'],
  });
export type Slot = z.infer<typeof SlotSchema>;

export const VersionSchema = z.object({
  id: z.string().min(1),
  slotId: z.string().min(1),
  componentId: z.string().min(1),
  params: z.record(z.string(), z.unknown()),
  customPath: z.string().optional(),
  /** `default`: a scene's safe default, written by code when no model could fill it (spec 07 R1.4). */
  source: z.enum(['ai-device', 'ai-cloud', 'ai-claude', 'user', 'plan', 'default']),
  model: z.string().optional(),
  costCredits: z.number().nonnegative(),
  /** Epoch ms (Firestore Timestamps are converted at the adapter). */
  createdAt: IntMsSchema,
  label: z.string().optional(),
  /** The slot's timing at this version, so a restore brings the feel back too (D-038). */
  timing: SlotTimingSchema.optional(),
});
export type Version = z.infer<typeof VersionSchema>;

export const CleanupSchema = z.object({
  fillersRemoved: z.number().int().nonnegative(),
  pausesShortened: z.number().int().nonnegative(),
  enabled: z.boolean(),
  /** Why cleanup made no cuts: it would have removed too much, or there was no speech. */
  skipped: z.enum(['too-much', 'no-speech']).optional(),
});
export type Cleanup = z.infer<typeof CleanupSchema>;

/**
 * The voiceover the editor plays (spec 05). `src` is the active audio: an AudioStore ref
 * (`idb:…`, later a Storage path) or a synthesized fixture (`synth:…`). The original is
 * always kept so cleanup can be turned off without transcribing again.
 */
export const VoiceoverSchema = z.object({
  src: z.string().min(1),
  /** Duration of the active audio. */
  durationMs: IntMsSchema,
  /** Min/max pairs per bucket. */
  peaks: z.array(z.number()).optional(),
  source: z.enum(['record', 'upload', 'tts', 'sample']).optional(),
  originalSrc: z.string().min(1).optional(),
  originalDurationMs: IntMsSchema.optional(),
  cleanup: CleanupSchema.optional(),
  /** A generated voice (spec 11 task 17): what was read, by which voice, at which pace. */
  tts: z
    .object({
      voiceId: z.string().min(1),
      speed: z.number().positive(),
      script: z.string().max(SCRIPT_MAX_CHARS),
    })
    .optional(),
});
export type Voiceover = z.infer<typeof VoiceoverSchema>;

/** The minimal shape `timelineIssues` needs, so it can run on partial or drafted projects. */
export interface TimelineInput {
  durationMs: number;
  slots: ReadonlyArray<{
    id: string;
    startMs: number;
    endMs: number;
    wordStart: number;
    wordEnd: number;
  }>;
  transcript: { words: ReadonlyArray<unknown> };
}

/**
 * Pure check of the timeline invariants (editor-timeline.md). Returns human-readable
 * issues; an empty list means valid. Slot order in the array does not matter.
 * Touching slots (end == next start) are allowed.
 */
export function timelineIssues(project: TimelineInput): string[] {
  const issues: string[] = [];
  const wordCount = project.transcript.words.length;
  const seen = new Set<string>();

  for (const s of project.slots) {
    if (seen.has(s.id)) issues.push(`duplicate slot id "${s.id}"`);
    seen.add(s.id);
    if (s.startMs < 0 || s.startMs >= s.endMs || s.endMs > project.durationMs) {
      issues.push(
        `slot "${s.id}" must satisfy 0 <= startMs < endMs <= durationMs (got ${s.startMs}..${s.endMs}, duration ${project.durationMs})`,
      );
    }
    if (s.wordStart > s.wordEnd) {
      issues.push(`slot "${s.id}" wordStart ${s.wordStart} is after wordEnd ${s.wordEnd}`);
    }
    if (s.wordStart >= wordCount || s.wordEnd >= wordCount) {
      issues.push(
        `slot "${s.id}" word range ${s.wordStart}..${s.wordEnd} is outside the transcript (${wordCount} words)`,
      );
    }
  }

  const sorted = [...project.slots].sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    if (prev && cur && cur.startMs < prev.endMs) {
      issues.push(`slots "${prev.id}" and "${cur.id}" overlap`);
    }
  }
  return issues;
}

export type WordRange = { wordStart: number; wordEnd: number };

/**
 * Indices of the first and last words overlapping [startMs, endMs), or null if none. Shared by
 * the editor commands (spec 04) and the slot post-pass (spec 06), so both snap the same way.
 */
export function wordsInRange(
  words: ReadonlyArray<{ startMs: number; endMs: number }>,
  startMs: number,
  endMs: number,
): WordRange | null {
  let first = -1;
  let last = -1;
  words.forEach((w, i) => {
    if (w.endMs > startMs && w.startMs < endMs) {
      if (first < 0) first = i;
      last = i;
    }
  });
  return first < 0 ? null : { wordStart: first, wordEnd: last };
}

/** Burned-in captions (spec 12 R3–R5, spec 23 R2). Optional on old projects; read with `DEFAULT_CAPTIONS`. */
export const CaptionsSettingSchema = z.object({
  enabled: z.boolean(),
  presetId: z.enum(['editorial', 'studio', 'minimal-pill', 'pop', 'clean', 'boxed']),
});
export type CaptionsSetting = z.infer<typeof CaptionsSettingSchema>;
export const DEFAULT_CAPTIONS: CaptionsSetting = { enabled: true, presetId: 'pop' };

/** Music choices (spec 12 R7.1): two synthesized beds or the user's own track. Absent = no music. */
export const MusicIdSchema = z.enum(['calm-pad', 'steady-pulse', 'own']);
export type MusicId = z.infer<typeof MusicIdSchema>;

/**
 * Music, ducking and sound effects (spec 12 design §1). Every level has a default, so `{}` parses
 * to `DEFAULT_AUDIO`. Auto effects are derived from the slots (`placeSfx`), never stored here.
 */
export const AudioSettingSchema = z.object({
  musicId: MusicIdSchema.optional(),
  /** AudioStore ref of the user's track when `musicId` is `own`. */
  musicSrc: z.string().min(1).optional(),
  musicName: z.string().max(80).optional(),
  /** Music under speech, relative to the measured voice level. */
  musicGainDb: z.number().int().min(-40).max(0).default(-18),
  ducking: z.boolean().default(true),
  duckDepthDb: z.number().int().min(0).max(24).default(8),
  autoSfx: z.boolean().default(true),
  sfxGainDb: z.number().int().min(-24).max(6).default(0),
  /** "Shuffle takes" bumps this. */
  sfxSeed: z.number().int().nonnegative().default(0),
});
export type AudioSetting = z.infer<typeof AudioSettingSchema>;
export const DEFAULT_AUDIO: AudioSetting = AudioSettingSchema.parse({});

/** The project's audio settings, `DEFAULT_AUDIO` for projects saved before spec 12. */
export function audioOf(p: { audio?: AudioSetting | undefined }): AudioSetting {
  return p.audio ?? DEFAULT_AUDIO;
}

/**
 * The sound a reel's effects bed mixes (spec 37 R3.4), the same in the preview and the export:
 * effects on/off and their level, and the synthesised music when one is chosen and no generated
 * track replaces it.
 */
export function reelBedSound(p: {
  audio?: AudioSetting | undefined;
  reel?: { music?: { src?: string | undefined } | undefined } | undefined;
}): {
  sfx: boolean;
  sfxGainDb: number;
  music: 'calm-pad' | 'steady-pulse' | null;
  musicGainDb?: number;
} {
  const a = audioOf(p);
  const synth = a.musicId === 'calm-pad' || a.musicId === 'steady-pulse' ? a.musicId : null;
  const music = p.reel?.music?.src ? null : synth;
  return {
    sfx: a.autoSfx !== false,
    sfxGainDb: a.sfxGainDb,
    music,
    ...(p.audio && music ? { musicGainDb: a.musicGainDb } : {}),
  };
}

/**
 * The project object before the timeline refinement (spec 11 task 1). Exported so document
 * schemas can `.omit`/`.extend` it (`.omit` does not exist on the refined schema).
 */
export const EditorProjectBaseSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  title: z.string(),
  format: FormatSchema,
  fps: z.literal(30),
  styleId: z.string().min(1),
  /** Beat energy for the whole video (spec 07); defaults to the look's. Slots may override. */
  energy: EnergySchema.optional(),
  durationMs: z.number().int().positive(),
  voiceover: VoiceoverSchema,
  transcript: TranscriptSchema,
  /** The transcript of the original (uncleaned) audio, for turning cleanup off (spec 09). */
  originalTranscript: TranscriptSchema.optional(),
  slots: z.array(SlotSchema),
  versions: z.array(VersionSchema),
  /** Epoch ms. */
  createdAt: IntMsSchema,
  updatedAt: IntMsSchema,
  /** Filled by the Firestore adapter (spec 11). */
  ownerId: z.string().min(1).optional(),
  /** Epoch ms of the last time the editor opened it, outside the undo history (spec 11). */
  lastOpenedAt: IntMsSchema.optional(),
  /** Burned-in captions; absent means `DEFAULT_CAPTIONS` (spec 12). */
  captions: CaptionsSettingSchema.optional(),
  /** Music, ducking and effects; absent means `DEFAULT_AUDIO` (spec 12b, read with `audioOf`). */
  audio: AudioSettingSchema.optional(),
  /** Brand colours over the look's accents; absent means the look's own (Brand panel). */
  brand: BrandSchema.optional(),
  /** Type over the look's own (Fonts panel): bundled OFL families only. */
  fonts: z
    .object({ display: z.enum(FONT_CHOICES), body: z.enum(FONT_CHOICES) })
    .partial()
    .strict()
    .optional(),
  /** Images the scenes use (spec 07 R4): generated, uploaded or from the open media search. */
  assets: z.array(ImageAssetSchema).max(60).optional(),
  /** Film mode (spec 07b): the storyboard and shared drawings the video's beats were built from. */
  film: ProjectFilmSchema.optional(),
  /** Source video (spec 18): cuts, punch-ins and default overlay anchor. Absent for voice-only projects. */
  video: VideoTrackSchema.optional(),
  /** Secondary Media Bin clips: user-uploaded B-roll, screen recordings, screenshots & photos (spec 20). */
  mediaBin: z.array(MediaClipSchema).max(24).optional(),
  /**
   * Talking-head reel (spec 25): scene templates over the speaker video, on the cleaned timeline.
   * When present with `video`, the preview and the export use the reel engine, not the slots.
   */
  reel: ReelPlanSchema.optional(),
});

export const EditorProjectSchema = EditorProjectBaseSchema.superRefine((p, ctx) => {
  for (const message of timelineIssues(p)) {
    ctx.addIssue({ code: 'custom', message, path: ['slots'] });
  }
});
export type EditorProject = z.infer<typeof EditorProjectSchema>;
