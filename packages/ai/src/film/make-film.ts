import {
  timeBeats,
  type FilmWord,
  type Format,
  type Storyboard,
  type TimedBeat,
} from '@motionpop/schemas';
import type { Router } from '../router';
import {
  filmBuildTask,
  filmDirectTask,
  filmPropsTask,
  type FilmBuildInput,
  type FilmBuildOutput,
} from '../tasks/film';

/**
 * Film mode (spec 07b): a whole voiceover in, a film out. Three roles:
 *
 * 1. The Director writes the storyboard once: the world, the recurring element, a picture for
 *    every beat and the seam at every cut.
 * 2. The Builders write the beats, all at the same time. None sees another's code; they agree
 *    because they read the same storyboard and build on the same kit.
 * 3. The Critic watches each built beat in a browser and sends its problems back, up to
 *    `maxRepairs` times. A beat that still fails is returned as failed, and the caller fills its
 *    span another way (the app uses the quick-mode scene).
 *
 * Pure orchestration: the router, the lint, the kit reference and the critic are passed in, so
 * the same code runs in the app (Firebase AI Logic, a sandboxed frame) and in the lab (Vertex, a
 * headless browser).
 */
export interface FilmInput {
  words: FilmWord[];
  durationMs: number;
  format: Format;
  look: { name: string; description: string };
  note?: string;
}

/** A beat as the composition takes it: the params of a `custom` slot. */
export interface FilmBeatParams extends FilmBuildOutput {
  brief: string;
  film: { tailMs: number; over: 'out' | 'in'; headMs: number };
  props?: Record<string, string>;
  cues?: { kind: 'whoosh' | 'pop' | 'tick' | 'rise' | 'impact'; atMs: number }[];
}

export interface CriticVerdict {
  /** Problems to send back, one per line; null when the beat passes. */
  fixes: string | null;
  /** How many problems block the beat (0 when it passes). */
  blocking: number;
  /** The beat failed to run at all. */
  broken: boolean;
  cues?: FilmBeatParams['cues'];
}

export interface FilmBeatResult {
  beat: TimedBeat;
  /** Null when no usable beat came back. */
  params: FilmBeatParams | null;
  /** Model calls made for this beat. */
  calls: number;
  /** Critic rounds that asked for a repair. */
  repairs: number;
  /** What was still wrong with the beat that was kept (empty when it passed). */
  problems: string | null;
  latencyMs: number;
}

export type FilmProgress =
  | { phase: 'storyboard'; state: 'start' | 'done' | 'failed' }
  | { phase: 'props'; state: 'start' | 'done' | 'failed' }
  | {
      phase: 'beat';
      beatId: string;
      index: number;
      count: number;
      state: 'building' | 'checking' | 'repairing' | 'ready' | 'failed';
    };

export interface FilmDeps {
  router: Router;
  lint: (p: Pick<FilmBuildOutput, 'html' | 'css' | 'script'>) => string[];
  lintProp: (svg: string) => string[];
  kitDoc: string;
  example: { html: string; css: string; script: string };
  /** Watches a built beat. Without it beats are only linted. */
  inspect?: (params: FilmBeatParams, beat: TimedBeat, words: FilmWord[]) => Promise<CriticVerdict>;
  onProgress?: (e: FilmProgress) => void;
  /** Critic rounds per beat (default 2). */
  maxRepairs?: number;
  /** Beats built at once (default 4). */
  concurrency?: number;
  /** Stops before the next model call when it returns true. */
  cancelled?: () => boolean;
  /** A storyboard to build from (a re-run after an edit): skips the Director. */
  storyboard?: Storyboard;
}

export interface FilmResult {
  storyboard: Storyboard;
  props: Record<string, string>;
  beats: FilmBeatResult[];
  calls: number;
  latencyMs: number;
}

export class FilmCancelled extends Error {
  constructor() {
    super('film cancelled');
  }
}

/** The beat's own words, with times from the beat's start (what the script sees as ctx.words). */
export function beatWords(beat: TimedBeat, words: readonly FilmWord[]): FilmWord[] {
  const len = beat.endMs - beat.startMs;
  const clamp = (ms: number) => Math.min(len, Math.max(0, Math.round(ms - beat.startMs)));
  return words.slice(beat.wordStart, beat.wordEnd + 1).map((w) => {
    const startMs = clamp(w.startMs);
    return { text: w.text, startMs, endMs: Math.max(startMs, clamp(w.endMs)) };
  });
}

const short = (s: string, n = 160) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** What one builder is told (pure; exported for tests and the lab). */
export function buildInputFor(
  board: Storyboard,
  timed: readonly TimedBeat[],
  i: number,
  input: FilmInput,
  example: FilmDeps['example'],
): FilmBuildInput {
  const beat = timed[i] as TimedBeat;
  const prev = timed[i - 1];
  const next = timed[i + 1];
  return {
    film: { title: board.title, thesis: board.thesis, world: board.world, carrier: board.carrier },
    props: board.props,
    beat: {
      index: i,
      count: timed.length,
      lead: beat.lead,
      idea: beat.idea,
      text: beat.text,
      staging: beat.staging,
      landsOn: input.words[beat.landsOn]?.text ?? '',
      keyMomentMs: beat.keyMomentMs,
    },
    words: beatWords(beat, input.words).map(({ text, startMs }) => ({ text, startMs })),
    durationMs: beat.endMs - beat.startMs,
    tailMs: beat.tailMs,
    headMs: beat.headMs,
    seamIn: prev ? { kind: prev.seam.kind, note: prev.seam.note, from: short(prev.idea) } : null,
    seamOut: next ? { kind: beat.seam.kind, note: beat.seam.note, to: short(next.idea) } : null,
    format: input.format,
    look: input.look,
    example,
  };
}

async function pool<T, R>(items: readonly T[], n: number, fn: (x: T, i: number) => Promise<R>) {
  const out: R[] = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(n, items.length)) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i] as T, i);
      }
    }),
  );
  return out;
}

export async function makeFilm(input: FilmInput, deps: FilmDeps): Promise<FilmResult> {
  const started = Date.now();
  const stop = () => {
    if (deps.cancelled?.()) throw new FilmCancelled();
  };
  let calls = 0;

  // 1. The storyboard.
  let board = deps.storyboard;
  if (!board) {
    deps.onProgress?.({ phase: 'storyboard', state: 'start' });
    try {
      const res = await deps.router.run(filmDirectTask, {
        words: input.words,
        durationMs: input.durationMs,
        format: input.format,
        look: input.look,
        ...(input.note ? { note: input.note } : {}),
      });
      calls += res.attempts;
      board = res.output;
    } catch (e) {
      deps.onProgress?.({ phase: 'storyboard', state: 'failed' });
      throw e;
    }
    deps.onProgress?.({ phase: 'storyboard', state: 'done' });
  }
  // Ids are ours: b1, b2, … whatever the model called them.
  board = { ...board, beats: board.beats.map((b, i) => ({ ...b, id: `b${i + 1}` })) };
  const timed = timeBeats(board, input.words, input.durationMs);
  stop();

  // 2. The shared drawings and every beat, at the same time.
  const propsJob = (async (): Promise<Record<string, string>> => {
    if (board.props.length === 0) return {};
    deps.onProgress?.({ phase: 'props', state: 'start' });
    try {
      const res = await deps.router.run(filmPropsTask(deps.lintProp), {
        film: { title: board.title, world: board.world },
        props: board.props,
      });
      calls += res.attempts;
      deps.onProgress?.({ phase: 'props', state: 'done' });
      return Object.fromEntries(res.output.props.map((p) => [p.id, p.svg]));
    } catch {
      // A film without its shared drawings still plays: `mp.prop` draws nothing.
      deps.onProgress?.({ phase: 'props', state: 'failed' });
      return {};
    }
  })();

  const beats = await pool(timed, deps.concurrency ?? 4, (_beat, i) =>
    buildOne(board, timed, i, input, deps, propsJob),
  );
  return {
    storyboard: board,
    props: await propsJob,
    beats,
    calls: calls + beats.reduce((n, b) => n + b.calls, 0),
    latencyMs: Date.now() - started,
  };
}

/**
 * One beat of a film that already has its storyboard (spec 07b R5.3, "Rebuild this beat"): the
 * same builder, critic and repair rounds as `makeFilm`, for beat `index` alone. `idea` replaces
 * the beat's picture when the creator rewrote it. The other beats are not touched; the seams on
 * both sides come from the storyboard, so the rebuilt beat still meets its neighbours.
 */
export async function rebuildBeat(
  input: FilmInput,
  deps: FilmDeps & { storyboard: Storyboard; props: Record<string, string> },
  index: number,
  idea?: string,
): Promise<FilmBeatResult> {
  const board: Storyboard = {
    ...deps.storyboard,
    beats: deps.storyboard.beats.map((b, i) => ({
      ...b,
      id: `b${i + 1}`,
      ...(i === index && idea && idea.trim().length >= 8
        ? { idea: idea.trim().slice(0, 500) }
        : {}),
    })),
  };
  const timed = timeBeats(board, input.words, input.durationMs);
  if (!timed[index]) throw new RangeError(`the film has no beat ${index + 1}`);
  return buildOne(board, timed, index, input, deps, Promise.resolve(deps.props));
}

/** Builds one beat: the builder, then the critic's rounds; keeps the best version. */
async function buildOne(
  board: Storyboard,
  timed: readonly TimedBeat[],
  i: number,
  input: FilmInput,
  deps: FilmDeps,
  propsJob: Promise<Record<string, string>>,
): Promise<FilmBeatResult> {
  const beat = timed[i] as TimedBeat;
  const task = filmBuildTask(deps.lint, deps.kitDoc);
  const maxRepairs = deps.maxRepairs ?? 2;
  const stop = () => {
    if (deps.cancelled?.()) throw new FilmCancelled();
  };
  const t0 = Date.now();
  const base = buildInputFor(board, timed, i, input, deps.example);
  const note = (state: 'building' | 'checking' | 'repairing' | 'ready' | 'failed') =>
    deps.onProgress?.({ phase: 'beat', beatId: beat.id, index: i, count: timed.length, state });
  const asParams = (out: FilmBuildOutput, props: Record<string, string>): FilmBeatParams => ({
    ...out,
    // The director's landing time is the truth; the builder's copy is only a cross-check.
    keyMomentMs: beat.keyMomentMs,
    brief: short(beat.idea, 500),
    film: { tailMs: beat.tailMs, over: beat.over, headMs: beat.headMs },
    ...(Object.keys(props).length ? { props } : {}),
  });
  let ownCalls = 0;
  let repairs = 0;
  let best: { params: FilmBeatParams; verdict: CriticVerdict | null } | null = null;
  let fix: FilmBuildInput['fix'];
  for (let round = 0; round <= maxRepairs; round++) {
    stop();
    note(round === 0 ? 'building' : 'repairing');
    let out: FilmBuildOutput;
    try {
      const res = await deps.router.run(task, fix ? { ...base, fix } : base);
      ownCalls += res.attempts;
      out = res.output;
    } catch {
      // No valid answer this round. Keep what an earlier round gave.
      break;
    }
    const params = asParams(out, await propsJob);
    if (!deps.inspect) {
      best = { params, verdict: null };
      break;
    }
    note('checking');
    let verdict: CriticVerdict;
    try {
      verdict = await deps.inspect(params, beat, input.words);
    } catch {
      // The critic itself failed: don't punish the beat for it.
      best = best ?? { params, verdict: null };
      break;
    }
    const withCues: FilmBeatParams = verdict.cues?.length
      ? { ...params, cues: verdict.cues.slice(0, 16) }
      : params;
    if (
      !best ||
      !best.verdict ||
      (best.verdict.broken && !verdict.broken) ||
      (best.verdict.broken === verdict.broken && verdict.blocking <= best.verdict.blocking)
    )
      best = { params: withCues, verdict };
    if (verdict.fixes === null) break;
    if (round === maxRepairs) break;
    repairs++;
    fix = { html: out.html, css: out.css, script: out.script, problems: verdict.fixes };
  }
  const usable = best && !best.verdict?.broken ? best.params : null;
  note(usable ? 'ready' : 'failed');
  return {
    beat,
    params: usable,
    calls: ownCalls,
    repairs,
    problems: best?.verdict?.fixes ?? (best ? null : 'no valid beat came back'),
    latencyMs: Date.now() - t0,
  };
}
