import { z } from 'zod';
import {
  FILM_MAX_MS,
  FormatSchema,
  StoryboardSchema,
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

export const FilmDirectInputSchema = z.object({
  words: z.array(WordSchema).min(3).max(3000),
  durationMs: z.number().int().positive().max(FILM_MAX_MS),
  format: FormatSchema,
  look: LookSchema,
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
const storyboardJsonSchema: Record<string, unknown> = {
  type: 'object',
  properties: {
    title: str,
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
          'idea',
          'text',
          'landsOn',
          'staging',
          'seam',
        ],
      },
    },
  },
  required: ['title', 'thesis', 'world', 'carrier', 'props', 'beats'],
};

/** `film.direct`: the whole narration in, the storyboard out. Two repairs: the tiling is strict. */
export const filmDirectTask: TaskDef<FilmDirectInput, Storyboard> = {
  id: 'film.direct',
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
      ...(i.note ? { note: i.note } : {}),
    }),
  cloudCost: () => 0,
  cloudFallback: false,
  maxRepairs: 2,
  thinking: 'HIGH',
  jsonSchema: () => storyboardJsonSchema,
  check: (out, input) => {
    const issues = storyboardIssues(out, input.words, input.durationMs);
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
  }),
  props: z.array(
    z.object({ id: z.string(), draw: z.string(), width: z.number(), height: z.number() }),
  ),
  beat: z.object({
    index: z.number().int().nonnegative(),
    count: z.number().int().positive(),
    lead: z.string(),
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
  format: FormatSchema,
  look: LookSchema,
  example: BeatCodeSchema,
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
    input: FilmBuildInputSchema,
    output: FilmBuildOutputSchema,
    mode: () => 'ONLY_IN_CLOUD',
    model: (cfg) => cfg.modelStrong,
    system: filmBuildSystemV1(kitDoc),
    prompt: (i) => filmBuildPromptV1(i as Parameters<typeof filmBuildPromptV1>[0]),
    cloudCost: () => 0,
    cloudFallback: false,
    maxRepairs: 1,
    thinking: 'MEDIUM',
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
    input: FilmPropsInputSchema,
    output: FilmPropsOutputSchema,
    mode: () => 'ONLY_IN_CLOUD',
    model: (cfg) => cfg.modelStrong,
    system: FILM_PROPS_SYSTEM_V1,
    prompt: (i) => filmPropsPromptV1(i),
    cloudCost: () => 0,
    cloudFallback: false,
    maxRepairs: 1,
    thinking: 'MEDIUM',
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
