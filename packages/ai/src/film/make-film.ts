import {
  isMediaStageMode,
  timeBeats,
  type FilmWord,
  type Format,
  type Storyboard,
  type TimedBeat,
  type VideoStageMode,
} from '@motionpop/schemas';
import type { Router } from '../router';
import {
  filmBuildTask,
  filmDirectTask,
  filmPropsTask,
  type DirectMediaClip,
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
  /** True when live speaker video plays beneath/beside the beats (spec 19). */
  hasVideo?: boolean;
  /** Sampled keyframes for multimodal video choreography direction. */
  frames?: { timeMs: number; mimeType: 'image/jpeg' | 'image/png'; base64: string }[];
  /** Indexed Media Bin clips (B-roll, screen recordings, screenshots) available to weave into beats (spec 20). */
  mediaBin?: DirectMediaClip[];
  /** Word indices with detected vocal emphasis from on-device prosody (spec 20). */
  stressedWords?: number[];
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
  /** Dynamic archetype-specific example selector per beat (spec 19 R2.1). */
  exampleFor?: (beat: TimedBeat) => { html: string; css: string; script: string };
  /** Spatial safe-zone guide for a video stage mode (spec 19 R3.3, extended in spec 20). */
  stageGuideFor?: (
    stage: VideoStageMode,
    format: Format,
    clipFocus?: { focusX?: number; focusY?: number; clipSummary?: string },
  ) => string;
  /** Explicit model id override for the Director (`film.direct`, e.g. Pip model selector). */
  model?: string;
  /** Optional model override for parallel Builders (`film.build`); defaults to `cfg.modelFilmBuild` for 8x faster parallel fan-out. */
  buildModel?: string;
  /** Watches a built beat. Without it beats are only linted. */
  inspect?: (params: FilmBeatParams, beat: TimedBeat, words: FilmWord[]) => Promise<CriticVerdict>;
  onProgress?: (e: FilmProgress) => void;
  /** Fires immediately as each parallel beat finishes so the editor can stream beats live. */
  onBeatReady?: (
    result: FilmBeatResult,
    index: number,
    storyboard: Storyboard,
    timed: readonly TimedBeat[],
  ) => void;
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
  opts?: {
    beatExample?: FilmDeps['example'];
    stageGuide?: string;
  },
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
      ...(beat.archetype ? { archetype: beat.archetype } : {}),
      ...(beat.videoStage ? { videoStage: beat.videoStage } : {}),
      ...(opts?.stageGuide ? { stageGuide: opts.stageGuide } : {}),
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
    beats: timed.map((b) => ({
      lead: b.lead,
      idea: b.idea,
      text: b.text,
      landsOn: input.words[b.landsOn]?.text ?? '',
    })),
    format: input.format,
    look: input.look,
    example,
    ...(opts?.beatExample ? { beatExample: opts.beatExample } : {}),
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

  const runOpts = deps.model ? { model: deps.model } : undefined;
  // 1. The storyboard.
  let board = deps.storyboard;
  if (!board) {
    deps.onProgress?.({ phase: 'storyboard', state: 'start' });
    try {
      const res = await deps.router.run(
        filmDirectTask,
        {
          words: input.words,
          durationMs: input.durationMs,
          format: input.format,
          look: input.look,
          ...(input.hasVideo ? { hasVideo: true } : {}),
          ...(input.frames?.length ? { frames: input.frames } : {}),
          ...(input.mediaBin?.length ? { mediaBin: input.mediaBin } : {}),
          ...(input.stressedWords?.length ? { stressedWords: input.stressedWords } : {}),
          ...(input.note ? { note: input.note } : {}),
        },
        runOpts,
      );
      calls += res.attempts;
      board = res.output;
    } catch (e) {
      deps.onProgress?.({ phase: 'storyboard', state: 'failed' });
      throw e;
    }
    deps.onProgress?.({ phase: 'storyboard', state: 'done' });
  }
  // Ids are ours: b1, b2, … whatever the model called them. Also backfill any media-stage beat
  // with its best-matching Media Bin clip & moment parameters when omitted by the Director.
  const bin = input.mediaBin ?? [];
  const pickClipForStage = (mode: VideoStageMode): DirectMediaClip | undefined => {
    if (bin.length === 0) return undefined;
    if (mode === 'screen-showcase') {
      return bin.find((c) => c.kind === 'screen-recording') ?? bin[0];
    }
    if (mode === 'media-card-pop') {
      return bin.find((c) => c.kind === 'screenshot' || c.kind === 'photo') ?? bin[0];
    }
    return bin.find((c) => c.kind === 'broll') ?? bin[0];
  };
  board = {
    ...board,
    beats: board.beats.map((b, i) => {
      const id = `b${i + 1}`;
      if (!b.videoStage || !isMediaStageMode(b.videoStage)) return { ...b, id };
      const clip = (b.clipId ? bin.find((c) => c.id === b.clipId) : undefined) ?? pickClipForStage(b.videoStage);
      if (!clip) return { ...b, id, videoStage: 'full' as const };
      const m = clip.moments?.[0];
      return {
        ...b,
        id,
        clipId: clip.id,
        clipStartMs: b.clipStartMs ?? m?.startMs ?? 0,
        ...(b.clipEndMs !== undefined || m?.endMs !== undefined
          ? { clipEndMs: b.clipEndMs ?? m?.endMs }
          : {}),
        clipFocusX: b.clipFocusX ?? m?.focusX ?? 0.5,
        clipFocusY: b.clipFocusY ?? m?.focusY ?? 0.45,
        clipZoom: b.clipZoom ?? m?.zoom ?? (b.videoStage === 'screen-showcase' ? 1.5 : 1.05),
      };
    }),
  };
  const timed = timeBeats(board, input.words, input.durationMs);
  stop();

  // 2. The shared drawings and every beat, at the same time.
  const propsJob = (async (): Promise<Record<string, string>> => {
    if (board.props.length === 0) return {};
    deps.onProgress?.({ phase: 'props', state: 'start' });
    try {
      const res = await deps.router.run(
        filmPropsTask(deps.lintProp),
        {
          film: { title: board.title, world: board.world },
          props: board.props,
        },
        deps.buildModel ? { model: deps.buildModel } : { model: 'gemini-3.8-flash' },
      );
      calls += res.attempts;
      deps.onProgress?.({ phase: 'props', state: 'done' });
      return Object.fromEntries(res.output.props.map((p) => [p.id, p.svg]));
    } catch {
      // A film without its shared drawings still plays: `mp.prop` draws nothing.
      deps.onProgress?.({ phase: 'props', state: 'failed' });
      return {};
    }
  })();

  const beats = await pool(timed, deps.concurrency ?? 4, async (_beat, i) => {
    const built = await buildOne(board, timed, i, input, deps, propsJob);
    deps.onBeatReady?.(built, i, board, timed);
    return built;
  });
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
  const stageMode = input.hasVideo ? (beat.videoStage ?? 'full') : undefined;
  const boundClip = beat.clipId ? input.mediaBin?.find((c) => c.id === beat.clipId) : undefined;
  const stageGuide = stageMode
    ? deps.stageGuideFor?.(
        stageMode,
        input.format,
        boundClip || beat.clipFocusX !== undefined || beat.clipFocusY !== undefined
          ? {
              ...(beat.clipFocusX !== undefined ? { focusX: beat.clipFocusX } : {}),
              ...(beat.clipFocusY !== undefined ? { focusY: beat.clipFocusY } : {}),
              ...(boundClip ? { clipSummary: boundClip.summary } : {}),
            }
          : undefined,
      )
    : undefined;
  const beatExample = deps.exampleFor?.(beat);
  const base = buildInputFor(board, timed, i, input, deps.example, {
    ...(beatExample ? { beatExample } : {}),
    ...(stageGuide ? { stageGuide } : {}),
  });
  const buildOpts = deps.buildModel ? { model: deps.buildModel } : undefined;
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
      const res = await deps.router.run(task, fix ? { ...base, fix } : base, buildOpts);
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
