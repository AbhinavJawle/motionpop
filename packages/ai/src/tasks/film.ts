import { z } from 'zod';
import {
  BEAT_ARCHETYPES,
  FILM_MAX_MS,
  FormatSchema,
  REEL_TONES,
  StoryboardSchema,
  VIDEO_STAGE_MODES,
  storyboardIssues,
  type Storyboard,
} from '@motionpop/schemas';
import {
  FILM_PROPS_SYSTEM_V1,
  filmBuildPromptV1,
  filmBuildSystemV1,
  filmPropsPromptV1,
} from '../prompts/film-build.v1';
import { FILM_DIRECT_SYSTEM_V1, filmDirectPromptV1 } from '../prompts/film-direct.v1';
import {
  REEL_DIRECT_SYSTEM_V2,
  reelBuildPromptV2,
  reelBuildSystemV2,
  reelDirectPromptV2,
} from '../prompts/reel-v2';
import type { TaskDef } from '../router';

/**
 * Film mode's three model tasks (spec 07b). All cloud only, on the strong model. None carries a
 * price of its own: a film is one credited action (`film`, by length), spent once by the app
 * before the first call and refunded if no film comes back.
 */
const LookSchema = z.object({ name: z.string().min(1), description: z.string().max(300) });
const WordSchema = z.object({
  text: z.string(),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative(),
});

const KeyframeSchema = z.object({
  timeMs: z.number().int().nonnegative(),
  mimeType: z.enum(['image/jpeg', 'image/png']),
  base64: z.string().min(16),
});

const DirectMediaClipSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(120),
  kind: z.enum(['broll', 'screen-recording', 'screenshot', 'photo']),
  durationMs: z.number().int().positive().optional(),
  summary: z.string().max(320),
  tags: z.array(z.string().max(40)).max(12).default([]),
  moments: z
    .array(
      z.object({
        startMs: z.number().int().nonnegative(),
        endMs: z.number().int().nonnegative(),
        focusX: z.number().min(0).max(1),
        focusY: z.number().min(0).max(1),
        zoom: z.number().min(1).max(2.4),
        description: z.string().max(220),
      }),
    )
    .max(6)
    .default([]),
});
export type DirectMediaClip = z.infer<typeof DirectMediaClipSchema>;

export const FilmDirectInputSchema = z.object({
  words: z.array(WordSchema).min(3).max(3000),
  durationMs: z.number().int().positive().max(FILM_MAX_MS),
  format: FormatSchema,
  look: LookSchema,
  hasVideo: z.boolean().optional(),
  frames: z.array(KeyframeSchema).max(16).optional(),
  mediaBin: z.array(DirectMediaClipSchema).max(24).optional(),
  /** Word indices with detected vocal emphasis from on-device prosody (spec 20). */
  stressedWords: z.array(z.number().int().nonnegative()).max(60).optional(),
  note: z.string().trim().max(500).optional(),
});
export type FilmDirectInput = z.infer<typeof FilmDirectInputSchema>;

const str = { type: 'string' };
const int = { type: 'integer' };
/**
 * The storyboard's shape as plain JSON Schema: types and required keys only. The limits live in
 * `StoryboardSchema` and `storyboardIssues`, which run on the answer; a generated schema with
 * every bound in it was rejected by the model API (lab run, 2026-11-17).
 */
/**
 * Locked modern stage modes for Talking-Head Reel Engine v2 (spec 24 R1.3):
 * keeps Reels inside the crisp 50/50 split + clean breathing + top-card + real media grammar.
 */
const REEL_V2_STAGES_NO_CLIPS = [
  'split-top-stage',
  'clean',
  'top-card',
  'cutaway',
  'split-top-broll',
  'broll-full',
  'media-card-pop',
] as const;

const REEL_V2_STAGES_WITH_CLIPS = [
  ...REEL_V2_STAGES_NO_CLIPS,
  'screen-showcase',
] as const;

function storyboardJsonSchemaFor(
  input: FilmDirectInput,
  reelV2 = false,
): Record<string, unknown> {
  const hasClips = Boolean(input.mediaBin && input.mediaBin.length > 0);
  const clipEnum = hasClips ? [...input.mediaBin!.map((c) => c.id), 'none'] : undefined;
  const stageModes = reelV2
    ? hasClips
      ? [...REEL_V2_STAGES_WITH_CLIPS]
      : [...REEL_V2_STAGES_NO_CLIPS]
    : hasClips
      ? [...VIDEO_STAGE_MODES]
      : [
          'split-top-stage',
          'top-card',
          'clean',
          'full',
          'split-left',
          'split-right',
          'pip',
          'backdrop',
          'cutaway',
          'split-top-broll',
          'broll-full',
          'media-card-pop',
        ];
  return {
    type: 'object',
    properties: {
      title: str,
      ...(input.hasVideo ? { tone: { type: 'string', enum: [...REEL_TONES] } } : {}),
      thesis: str,
      world: str,
      carrier: str,
      props: {
        type: 'array',
        items: {
          type: 'object',
          properties: { id: str, draw: str, width: { type: 'number' }, height: { type: 'number' } },
          required: ['id', 'draw', 'width', 'height'],
        },
      },
      beats: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: str,
            wordStart: int,
            wordEnd: int,
            lead: { type: 'string', enum: ['picture', 'map', 'number', 'type'] },
            archetype: { type: 'string', enum: [...BEAT_ARCHETYPES] },
            videoStage: { type: 'string', enum: stageModes },
            focusX: { type: 'number' },
            focusY: { type: 'number' },
            ...(input.hasVideo
              ? {
                  brollQuery: str,
                  imageSubject: str,
                  imageKeyed: { type: 'boolean' },
                }
              : {}),
            ...(clipEnum
              ? {
                  clipId: { type: 'string', enum: clipEnum },
                  clipStartMs: int,
                  clipEndMs: int,
                  clipFocusX: { type: 'number' },
                  clipFocusY: { type: 'number' },
                  clipZoom: { type: 'number' },
                }
              : {}),
            idea: str,
            text: { type: 'array', items: str },
            landsOn: int,
            staging: str,
            seam: {
              type: 'object',
              properties: {
                kind: { type: 'string', enum: ['push', 'lift', 'cover', 'zoom', 'match'] },
                note: str,
              },
              required: ['kind', 'note'],
            },
          },
          required: [
            'id',
            'wordStart',
            'wordEnd',
            'lead',
            'archetype',
            ...(input.hasVideo ? ['videoStage'] : []),
            ...(clipEnum ? ['clipId'] : []),
            'idea',
            'text',
            'landsOn',
            'staging',
            'seam',
          ],
        },
      },
    },
    required: [
      'title',
      ...(input.hasVideo ? ['tone'] : []),
      'thesis',
      'world',
      'carrier',
      'props',
      'beats',
    ],
  };
}

/** `film.direct`: the whole narration in, the storyboard out. Two repairs: the tiling is strict. */
export const filmDirectTask: TaskDef<FilmDirectInput, Storyboard> = {
  id: 'film.direct',
  maxOutputTokens: 6144,
  input: FilmDirectInputSchema,
  output: StoryboardSchema,
  mode: () => 'ONLY_IN_CLOUD',
  model: (cfg) => cfg.modelStrong,
  system: FILM_DIRECT_SYSTEM_V1,
  prompt: (i) =>
    filmDirectPromptV1({
      words: i.words,
      durationMs: i.durationMs,
      format: i.format,
      look: i.look,
      ...(i.hasVideo ? { hasVideo: true } : {}),
      ...(i.frames?.length ? { frameTimesMs: i.frames.map((f) => f.timeMs) } : {}),
      ...(i.mediaBin?.length ? { mediaBin: i.mediaBin } : {}),
      ...(i.stressedWords?.length ? { stressedWords: i.stressedWords } : {}),
      ...(i.note ? { note: i.note } : {}),
    }),
  mediaList: (i) =>
    i.frames?.length
      ? i.frames.map((f) => ({ mimeType: f.mimeType, base64: f.base64 }))
      : undefined,
  cloudCost: () => 0,
  cloudFallback: false,
  maxRepairs: 2,
  thinking: 'LOW',
  jsonSchema: (input) => storyboardJsonSchemaFor(input),
  check: (out, input) => {
    const issues = storyboardIssues(out, input.words, input.durationMs, {
      hasVideo: Boolean(input.hasVideo),
      mediaBinIds: (input.mediaBin ?? []).map((c) => c.id),
    });
    return issues.length ? `fix these problems:\n- ${issues.slice(0, 12).join('\n- ')}` : null;
  },
};

const BeatCodeSchema = z.object({ html: z.string(), css: z.string(), script: z.string() });

export const FilmBuildInputSchema = z.object({
  film: z.object({
    title: z.string(),
    thesis: z.string(),
    world: z.string(),
    carrier: z.string(),
    tone: z.string().optional(),
  }),
  props: z.array(
    z.object({ id: z.string(), draw: z.string(), width: z.number(), height: z.number() }),
  ),
  beat: z.object({
    index: z.number().int().nonnegative(),
    count: z.number().int().positive(),
    lead: z.string(),
    archetype: z.string().optional(),
    videoStage: z.string().optional(),
    stageGuide: z.string().optional(),
    stageWidth: z.number().int().positive().optional(),
    stageHeight: z.number().int().positive().optional(),
    imageAsset: z
      .object({ id: z.string(), subject: z.string(), keyed: z.boolean() })
      .optional(),
    idea: z.string(),
    text: z.array(z.string()),
    staging: z.string(),
    landsOn: z.string(),
    keyMomentMs: z.number().int().nonnegative(),
  }),
  words: z.array(z.object({ text: z.string(), startMs: z.number().int().nonnegative() })),
  durationMs: z.number().int().positive(),
  tailMs: z.number().int().nonnegative(),
  headMs: z.number().int().nonnegative(),
  seamIn: z.object({ kind: z.string(), note: z.string(), from: z.string() }).nullable(),
  seamOut: z.object({ kind: z.string(), note: z.string(), to: z.string() }).nullable(),
  /** The whole storyboard: part of the shared prefix of every builder's prompt (R3.4). */
  beats: z
    .array(
      z.object({
        lead: z.string(),
        videoStage: z.string().optional(),
        idea: z.string(),
        text: z.array(z.string()),
        landsOn: z.string(),
      }),
    )
    .min(1),
  format: FormatSchema,
  look: LookSchema,
  example: BeatCodeSchema,
  /** Dynamic archetype/stage-matched reference example for this beat (spec 19 + 24). */
  beatExample: BeatCodeSchema.optional(),
  /** Nearest sampled speaker keyframe JPEG so Reel v2 builders see the actual footage (spec 24 R3.1). */
  speakerFrame: KeyframeSchema.optional(),
  fix: BeatCodeSchema.extend({ problems: z.string() }).optional(),
});
export type FilmBuildInput = z.infer<typeof FilmBuildInputSchema>;

export const FilmBuildOutputSchema = z.object({
  title: z.string().trim().min(1).max(60),
  html: z.string().max(12_000),
  css: z.string().max(12_000),
  script: z.string().min(1).max(24_000),
  keyMomentMs: z.number().int().nonnegative(),
});
export type FilmBuildOutput = z.infer<typeof FilmBuildOutputSchema>;

const filmBuildJsonSchema: Record<string, unknown> = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    html: { type: 'string' },
    css: { type: 'string' },
    script: { type: 'string' },
    keyMomentMs: { type: 'integer' },
  },
  required: ['title', 'html', 'css', 'script', 'keyMomentMs'],
};

/**
 * `film.build`: one beat of the film. `lint` is the motion package's `lintCustom` and `kitDoc`
 * its kit reference, both injected because this package depends on motion for tests only. The
 * lint runs inside the router (one repair); the critic, which needs a browser, runs outside it
 * and comes back as a second call with `fix` set.
 */
export function filmBuildTask(
  lint: (p: Pick<FilmBuildOutput, 'html' | 'css' | 'script'>) => string[],
  kitDoc: string,
): TaskDef<FilmBuildInput, FilmBuildOutput> {
  return {
    id: 'film.build',
    maxOutputTokens: 8192,
    input: FilmBuildInputSchema,
    output: FilmBuildOutputSchema,
    mode: () => 'ONLY_IN_CLOUD',
    model: (cfg) => cfg.modelFilmBuild,
    system: filmBuildSystemV1(kitDoc),
    prompt: (i) => filmBuildPromptV1(i as Parameters<typeof filmBuildPromptV1>[0]),
    cloudCost: () => 0,
    cloudFallback: false,
    maxRepairs: 1,
    thinking: 'LOW',
    jsonSchema: () => filmBuildJsonSchema,
    check: (out, input) => {
      const problems = lint(out);
      // The key moment is the director's; a builder that moved it past the end is corrected.
      if (out.keyMomentMs > input.durationMs) problems.push('keyMomentMs is after the end');
      return problems.length ? `fix these problems: ${problems.join('; ')}` : null;
    },
  };
}

export const FilmPropsInputSchema = z.object({
  film: z.object({ title: z.string(), world: z.string() }),
  props: z
    .array(z.object({ id: z.string(), draw: z.string(), width: z.number(), height: z.number() }))
    .min(1)
    .max(3),
});
export type FilmPropsInput = z.infer<typeof FilmPropsInputSchema>;
export const FilmPropsOutputSchema = z.object({
  props: z.array(z.object({ id: z.string(), svg: z.string().min(20).max(8000) })).max(3),
});
export type FilmPropsOutput = z.infer<typeof FilmPropsOutputSchema>;

/** `film.props`: the film's shared drawings. `lintProp` is the motion package's check on one SVG. */
export function filmPropsTask(
  lintProp: (svg: string) => string[],
): TaskDef<FilmPropsInput, FilmPropsOutput> {
  return {
    id: 'film.props',
    maxOutputTokens: 6144,
    input: FilmPropsInputSchema,
    output: FilmPropsOutputSchema,
    mode: () => 'ONLY_IN_CLOUD',
    model: (cfg) => cfg.modelStrong,
    system: FILM_PROPS_SYSTEM_V1,
    prompt: (i) => filmPropsPromptV1(i),
    cloudCost: () => 0,
    cloudFallback: false,
    maxRepairs: 1,
    thinking: 'LOW',
    jsonSchema: () => ({
      type: 'object',
      properties: {
        props: {
          type: 'array',
          items: { type: 'object', properties: { id: str, svg: str }, required: ['id', 'svg'] },
        },
      },
      required: ['props'],
    }),
    check: (out, input) => {
      const problems: string[] = [];
      for (const want of input.props) {
        const got = out.props.find((p) => p.id === want.id);
        if (!got) problems.push(`the drawing "${want.id}" is missing`);
        else for (const p of lintProp(got.svg)) problems.push(`"${want.id}" ${p}`);
      }
      return problems.length ? `fix these problems: ${problems.join('; ')}` : null;
    },
  };
}

/**
 * `reel.direct` (spec 24 R1): dedicated Talking-Head Reel Director with zero Vox-documentary
 * bloat, MEDIUM thinking, full Reel v2 JSON schema (tone, brollQuery, imageSubject, locked stage enum),
 * and zero cartoon SVG props.
 */
export const reelDirectTask: TaskDef<FilmDirectInput, Storyboard> = {
  id: 'reel.direct',
  maxOutputTokens: 8192,
  input: FilmDirectInputSchema,
  output: StoryboardSchema,
  mode: () => 'ONLY_IN_CLOUD',
  model: (cfg) => cfg.modelStrong,
  system: REEL_DIRECT_SYSTEM_V2,
  prompt: (i) =>
    reelDirectPromptV2({
      words: i.words,
      durationMs: i.durationMs,
      format: i.format,
      look: i.look,
      ...(i.frames?.length ? { frameTimesMs: i.frames.map((f) => f.timeMs) } : {}),
      ...(i.mediaBin?.length ? { mediaBin: i.mediaBin } : {}),
      ...(i.stressedWords?.length ? { stressedWords: i.stressedWords } : {}),
      ...(i.note ? { note: i.note } : {}),
    }),
  mediaList: (i) =>
    i.frames?.length
      ? i.frames.map((f) => ({ mimeType: f.mimeType, base64: f.base64 }))
      : undefined,
  cloudCost: () => 0,
  cloudFallback: false,
  maxRepairs: 2,
  thinking: 'MEDIUM',
  jsonSchema: (input) => storyboardJsonSchemaFor(input, true),
  check: (out, input) => {
    const issues = storyboardIssues(out, input.words, input.durationMs, {
      hasVideo: true,
      mediaBinIds: (input.mediaBin ?? []).map((c) => c.id),
    });
    return issues.length ? `fix these problems:\n- ${issues.slice(0, 12).join('\n- ')}` : null;
  },
};

/**
 * `reel.build` (spec 24 R1 & R3): dedicated Talking-Head Reel Builder powered by the frontier
 * model (`cfg.modelFilmBuild` = `gemini-4-neon`), with clean Swiss/Studio HTML+CSS+SVG prompts,
 * clipped stage coordinates, and the nearest speaker keyframe attached as inline vision context.
 */
export function reelBuildTask(
  lint: (p: Pick<FilmBuildOutput, 'html' | 'css' | 'script'>) => string[],
  kitDoc: string,
): TaskDef<FilmBuildInput, FilmBuildOutput> {
  return {
    id: 'reel.build',
    maxOutputTokens: 8192,
    input: FilmBuildInputSchema,
    output: FilmBuildOutputSchema,
    mode: () => 'ONLY_IN_CLOUD',
    model: (cfg) => cfg.modelFilmBuild,
    system: reelBuildSystemV2(kitDoc),
    prompt: (i) =>
      reelBuildPromptV2({
        film: {
          title: i.film.title,
          thesis: i.film.thesis,
          world: i.film.world,
          ...(i.film.tone ? { tone: i.film.tone } : {}),
        },
        beat: i.beat,
        words: i.words,
        durationMs: i.durationMs,
        tailMs: i.tailMs,
        headMs: i.headMs,
        seamIn: i.seamIn,
        seamOut: i.seamOut,
        beats: i.beats,
        format: i.format,
        look: i.look,
        ...(i.beatExample ? { beatExample: i.beatExample } : {}),
        ...(i.fix ? { fix: i.fix } : {}),
      }),
    media: (i) =>
      i.speakerFrame
        ? { mimeType: i.speakerFrame.mimeType, base64: i.speakerFrame.base64 }
        : undefined,
    cloudCost: () => 0,
    cloudFallback: false,
    maxRepairs: 1,
    thinking: 'LOW',
    jsonSchema: () => filmBuildJsonSchema,
    check: (out, input) => {
      const problems = lint(out);
      if (out.keyMomentMs > input.durationMs) problems.push('keyMomentMs is after the end');
      return problems.length ? `fix these problems: ${problems.join('; ')}` : null;
    },
  };
}
