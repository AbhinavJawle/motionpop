import { timeBeats, type FilmWord, type Storyboard, type StoryBeat } from '@motionpop/schemas';
import { describe, expect, it } from 'vitest';
import type { Router } from '../router';
import type { FilmBuildInput, FilmBuildOutput } from '../tasks/film';
import {
  FilmCancelled,
  buildInputFor,
  makeFilm,
  type CriticVerdict,
  type FilmDeps,
  type FilmInput,
} from './make-film';

/** Twelve words, 600 ms apart, with no digits in their text. */
const LETTERS = 'abcdefghijkl';
const words: FilmWord[] = Array.from({ length: 12 }, (_, i) => ({
  text: `wd${LETTERS[i]}`,
  startMs: i * 600,
  endMs: i * 600 + 500,
}));
const DURATION_MS = 7200;

const input: FilmInput = {
  words,
  durationMs: DURATION_MS,
  format: '16:9',
  look: { name: 'Field notes', description: 'paper and ink' },
};

/** Three beats of four words each. */
function boardOf(props: Storyboard['props'] = []): Storyboard {
  const beat = (i: number, wordStart: number, kind: StoryBeat['seam']['kind']): StoryBeat => ({
    id: `x${i}`,
    wordStart,
    wordEnd: wordStart + 3,
    lead: 'picture',
    idea: `A picture for beat number ${i}`,
    text: ['A label'],
    landsOn: wordStart,
    staging: 'the picture arrives on the voice',
    seam: { kind, note: 'the same object carries the cut' },
  });
  return {
    title: 'A film',
    thesis: 'One idea that holds',
    world: 'A harbour at dawn',
    carrier: 'the ship',
    props,
    beats: [beat(1, 0, 'push'), beat(2, 4, 'lift'), beat(3, 8, 'zoom')],
  };
}

const SVG = '<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>';

interface Fake {
  router: Router;
  directs: number;
  props: number;
  builds: FilmBuildInput[];
}

/**
 * A fake of the router: it answers the three film tasks and records what it was asked. The cast
 * is the seam: `makeFilm` only calls `run`, so the rest of the Router is not needed here.
 */
function fakeRouter(h: {
  board?: Storyboard;
  directFails?: boolean;
  propsFails?: boolean;
  build?: (input: FilmBuildInput, index: number, call: number) => FilmBuildOutput;
}): Fake {
  const fake: Fake = {
    router: undefined as unknown as Router,
    directs: 0,
    props: 0,
    builds: [],
  };
  const counts = new Map<number, number>();
  const ok = (output: unknown) => ({
    output,
    ranOn: 'cloud',
    model: 'fake',
    costCredits: 0,
    latencyMs: 0,
    attempts: 1,
  });
  fake.router = {
    run: async (task: { id: string }, arg: unknown) => {
      if (task.id === 'film.direct' || task.id === 'reel.direct') {
        fake.directs++;
        if (h.directFails) throw new Error('director down');
        return ok(h.board ?? boardOf());
      }
      if (task.id === 'film.props') {
        fake.props++;
        if (h.propsFails) throw new Error('props down');
        return ok({ props: [{ id: 'ship', svg: SVG }] });
      }
      if (task.id === 'film.build' || task.id === 'reel.build') {
        const call = arg as FilmBuildInput;
        fake.builds.push(call);
        const index = call.beat.index;
        const n = (counts.get(index) ?? 0) + 1;
        counts.set(index, n);
        const out = h.build
          ? h.build(call, index, n)
          : {
              title: 'Beat',
              html: `b${index}v${n}`,
              css: '',
              script: 'return { seek() {} };',
              keyMomentMs: 0,
            };
        return ok(out);
      }
      throw new Error(`unexpected task ${task.id}`);
    },
  } as unknown as Router;
  return fake;
}

const depsFor = (router: Router, over: Partial<FilmDeps> = {}): FilmDeps => ({
  router,
  lint: () => [],
  lintProp: () => [],
  kitDoc: 'THE KIT',
  example: { html: '<div></div>', css: '', script: 'return { seek() {} };' },
  ...over,
});

/** A critic verdict for a beat whose html is `b<index>v<version>`. */
const verdictFor =
  (table: Record<string, Partial<CriticVerdict>>) =>
  async (params: { html: string }): Promise<CriticVerdict> => ({
    fixes: null,
    blocking: 0,
    broken: false,
    ...(table[params.html] ?? {}),
  });

describe('makeFilm', () => {
  it('returns one result per beat, ids b1..bn, with the times from timeBeats', async () => {
    const fake = fakeRouter({});
    const res = await makeFilm(input, depsFor(fake.router));
    expect(res.beats.map((b) => b.beat.id)).toEqual(['b1', 'b2', 'b3']);
    expect(res.storyboard.beats.map((b) => b.id)).toEqual(['b1', 'b2', 'b3']);
    const timed = timeBeats(boardOf(), words, DURATION_MS);
    expect(res.beats.map((b) => [b.beat.startMs, b.beat.endMs])).toEqual(
      timed.map((b) => [b.startMs, b.endMs]),
    );
    expect(res.beats.every((b) => b.params !== null)).toBe(true);
    // One director call and one build per beat; no props call without props.
    expect(res.calls).toBe(4);
    expect(fake.props).toBe(0);
  });

  it('sends a critic verdict with fixes back to the builder as fix.problems', async () => {
    const fake = fakeRouter({});
    const res = await makeFilm(
      input,
      depsFor(fake.router, {
        inspect: verdictFor({ b0v1: { fixes: 'the map is hidden', blocking: 1 } }),
      }),
    );
    const first = fake.builds.filter((b) => b.beat.index === 0);
    expect(first).toHaveLength(2);
    expect(first[0]?.fix).toBeUndefined();
    expect(first[1]?.fix?.problems).toBe('the map is hidden');
    expect(first[1]?.fix?.html).toBe('b0v1');
    expect(res.beats[0]?.repairs).toBe(1);
    expect(res.beats[0]?.params?.html).toBe('b0v2');
    expect(res.beats[1]?.repairs).toBe(0);
  });

  it('after maxRepairs keeps the version with the fewest blocking problems', async () => {
    const fake = fakeRouter({});
    const res = await makeFilm(
      input,
      depsFor(fake.router, {
        maxRepairs: 2,
        inspect: verdictFor({
          b0v1: { fixes: 'first', blocking: 3 },
          b0v2: { fixes: 'second', blocking: 1 },
          b0v3: { fixes: 'third', blocking: 2 },
        }),
      }),
    );
    const beat = res.beats[0];
    expect(fake.builds.filter((b) => b.beat.index === 0)).toHaveLength(3);
    expect(beat?.params?.html).toBe('b0v2');
    expect(beat?.problems).toBe('second');
    expect(beat?.repairs).toBe(2);
    expect(beat?.calls).toBe(3);
  });

  it('marks a beat whose builder always throws as failed, and builds the others', async () => {
    const fake = fakeRouter({
      build: (_input, index, call) => {
        if (index === 1) throw new Error('builder broke');
        return {
          title: 'Beat',
          html: `b${index}v${call}`,
          css: '',
          script: 'return {};',
          keyMomentMs: 0,
        };
      },
    });
    const res = await makeFilm(input, depsFor(fake.router));
    expect(res.beats[1]?.params).toBeNull();
    expect(res.beats[1]?.problems).toBe('no valid beat came back');
    expect(res.beats[0]?.params).not.toBeNull();
    expect(res.beats[2]?.params).not.toBeNull();
    // A builder that threw is not retried.
    expect(fake.builds.filter((b) => b.beat.index === 1)).toHaveLength(1);
  });

  it('still gives a film when the props call fails', async () => {
    const fake = fakeRouter({
      board: boardOf([{ id: 'ship', draw: 'a ship in profile', width: 10, height: 10 }]),
      propsFails: true,
    });
    const res = await makeFilm(input, depsFor(fake.router));
    expect(fake.props).toBe(1);
    expect(res.props).toEqual({});
    expect(res.beats.every((b) => b.params !== null)).toBe(true);
    expect(res.beats[0]?.params?.props).toBeUndefined();
  });

  it('gives the shared drawings to every beat when the props call works', async () => {
    const fake = fakeRouter({
      board: boardOf([{ id: 'ship', draw: 'a ship in profile', width: 10, height: 10 }]),
    });
    const res = await makeFilm(input, depsFor(fake.router));
    expect(res.props).toEqual({ ship: SVG });
    for (const b of res.beats) expect(b.params?.props).toEqual({ ship: SVG });
  });

  it('throws FilmCancelled once cancelled after the storyboard, before any beat is built', async () => {
    const fake = fakeRouter({});
    await expect(
      makeFilm(input, depsFor(fake.router, { cancelled: () => true })),
    ).rejects.toBeInstanceOf(FilmCancelled);
    expect(fake.directs).toBe(1);
    expect(fake.builds).toHaveLength(0);
  });

  it('lets a storyboard failure reach the caller', async () => {
    const fake = fakeRouter({ directFails: true });
    await expect(makeFilm(input, depsFor(fake.router))).rejects.toThrow('director down');
  });

  it('routes talking-head Reels through reel.direct + reel.build, skips film.props, fast-paths pure clean beats, and forwards clipped stage bounds + speakerFrame (spec 24)', async () => {
    const seenTasks: string[] = [];
    const seenModels: Record<string, string | undefined> = {};
    const reelBoard: Storyboard = {
      title: 'Studio Reel',
      tone: 'tech-explainer',
      thesis: 'Show clean UI mechanics',
      world: 'Crisp studio grid',
      carrier: 'Accent marker',
      props: [{ id: 'mirror', draw: 'a hand mirror', width: 80, height: 120 }],
      beats: [
        {
          id: 'b1',
          wordStart: 0,
          wordEnd: 3,
          lead: 'type',
          archetype: 'callout-hud',
          videoStage: 'split-top-stage',
          idea: 'Timing inspector on top 50% grid',
          text: ['Timing', 'Easing'],
          landsOn: 1,
          staging: 'Rows tick in',
          seam: { kind: 'push', note: 'Next beat' },
        },
        {
          id: 'b2',
          wordStart: 4,
          wordEnd: 7,
          lead: 'type',
          archetype: 'kinetic-type',
          videoStage: 'clean',
          idea: 'Pure unobstructed speaker breathing moment',
          text: [],
          landsOn: 5,
          staging: 'Speaker breathes',
          seam: { kind: 'push', note: 'Next beat' },
        },
        {
          id: 'b3',
          wordStart: 8,
          wordEnd: 11,
          lead: 'number',
          archetype: 'hero-stat',
          videoStage: 'top-card',
          idea: 'Compact dark top pill above speaker head',
          text: ['100% Free'],
          landsOn: 9,
          staging: 'Card pops in',
          seam: { kind: 'push', note: 'Hold' },
        },
      ],
    };
    const builds: FilmBuildInput[] = [];
    const router = {
      run: async (task: { id: string }, arg: unknown, opts?: { model?: string }) => {
        seenTasks.push(task.id);
        seenModels[task.id] = opts?.model;
        if (task.id === 'reel.direct') {
          return { output: reelBoard, ranOn: 'cloud', model: 'gemini-4-neon', costCredits: 0, latencyMs: 10, attempts: 1, cached: false };
        }
        if (task.id === 'reel.build') {
          const call = arg as FilmBuildInput;
          builds.push(call);
          return {
            output: {
              title: 'Beat',
              html: '<div>ok</div>',
              css: '',
              script: 'return { seek() {} };',
              keyMomentMs: 0,
            },
            ranOn: 'cloud',
            model: 'gemini-4-neon',
            costCredits: 0,
            latencyMs: 10,
            attempts: 1,
            cached: false,
          };
        }
        throw new Error(`unexpected task ${task.id}`);
      },
    } as unknown as Router;

    const res = await makeFilm(
      {
        ...input,
        format: '9:16',
        hasVideo: true,
        frames: [
          {
            timeMs: 1200,
            mimeType: 'image/jpeg',
            base64: '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwc=',
          },
        ],
      },
      depsFor(router, { model: 'gemini-4-neon' }),
    );

    expect(seenTasks).toEqual(['reel.direct', 'reel.build', 'reel.build']);
    expect(seenModels['reel.direct']).toBe('gemini-4-neon');
    expect(seenModels['reel.build']).toBe('gemini-4-neon');
    expect(res.props).toEqual({});
    expect(res.storyboard.props).toEqual([]);
    // Beat 2 (pure clean breathing beat with text: []) used 0 AI calls!
    expect(res.beats[1]?.calls).toBe(0);
    expect(res.beats[1]?.params?.html).toBe('');
    // Beat 1 (`split-top-stage`) got exact clipped 1080×960 stage dimensions + speakerFrame
    expect(builds[0]?.beat.stageWidth).toBe(1080);
    expect(builds[0]?.beat.stageHeight).toBe(960);
    expect(builds[0]?.speakerFrame?.base64).toContain('/9j/');
    // Beat 3 (`top-card`) got exact clipped 1080×538 stage dimensions
    expect(builds[1]?.beat.stageWidth).toBe(1080);
    expect(builds[1]?.beat.stageHeight).toBe(538);
  });
});

describe('buildInputFor', () => {
  it('has no seam into the first beat and no seam out of the last', () => {
    const board = boardOf();
    const timed = timeBeats(board, words, DURATION_MS);
    const example = { html: '', css: '', script: '' };
    const first = buildInputFor(board, timed, 0, input, example);
    const middle = buildInputFor(board, timed, 1, input, example);
    const last = buildInputFor(board, timed, 2, input, example);
    expect(first.seamIn).toBeNull();
    expect(first.seamOut?.kind).toBe('push');
    expect(middle.seamIn?.kind).toBe('push');
    expect(middle.seamOut?.kind).toBe('lift');
    expect(last.seamIn?.kind).toBe('lift');
    expect(last.seamOut).toBeNull();
  });
});
