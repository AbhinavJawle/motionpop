import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  BEAT_LEADS,
  FILM_MAX_TEXT_WORDS,
  FILM_MIN_BEAT_MS,
  SEAM_KINDS,
  StoryboardSchema,
  numbersIn,
  spokenNumbers,
  storyboardIssues,
  timeBeats,
  unspokenNumbers,
  type FilmWord,
  type Storyboard,
  type StoryBeat,
} from './film';

/** Words with strictly increasing times and no digits in their text (so they say no figure). */
const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
const word = (i: number) => `wd${LETTERS[i % 26]}`;
function wordsWith(gaps: number[], lens: number[]): FilmWord[] {
  let t = 0;
  return gaps.map((gap, i) => {
    const startMs = t + gap;
    const endMs = startMs + (lens[i] as number);
    t = endMs;
    return { text: word(i), startMs, endMs };
  });
}

function beatOf(i: number, wordStart: number, wordEnd: number, landsOn: number, kind = 'push') {
  return {
    id: `x${i}`,
    wordStart,
    wordEnd,
    lead: 'picture',
    idea: `A picture for beat number ${i}`,
    text: [],
    landsOn,
    staging: 'the picture arrives',
    seam: { kind: kind, note: 'the same object' },
  } as StoryBeat;
}

const boardOf = (beats: StoryBeat[]): Pick<Storyboard, 'beats'> => ({ beats });

// ---- timeBeats -------------------------------------------------------------------------------

/** A word list whose starts increase (gaps ≥ 0) and whose lengths are ≥ 40 ms. */
const wordsArb = fc
  .array(
    fc.record({ gap: fc.integer({ min: 0, max: 400 }), len: fc.integer({ min: 40, max: 700 }) }),
    { minLength: 1, maxLength: 60 },
  )
  .map((items) =>
    wordsWith(
      items.map((i) => i.gap),
      items.map((i) => i.len),
    ),
  );

/** Cut the word list into beats: a true flag at i starts a new beat at word i + 1. */
const boardArb = (words: FilmWord[]) => {
  const n = words.length;
  return fc
    .record({
      cuts: fc.array(fc.boolean(), {
        minLength: Math.max(0, n - 1),
        maxLength: Math.max(0, n - 1),
      }),
      lands: fc.array(fc.nat(), { minLength: n, maxLength: n }),
      seams: fc.array(fc.constantFrom(...SEAM_KINDS), { minLength: n, maxLength: n }),
      leads: fc.array(fc.constantFrom(...BEAT_LEADS), { minLength: n, maxLength: n }),
      tailMs: fc.integer({ min: 0, max: 1500 }),
    })
    .map(({ cuts, lands, seams, leads, tailMs }) => {
      const beats: StoryBeat[] = [];
      let start = 0;
      for (let i = 0; i < n; i++) {
        const isEnd = i === n - 1 || cuts[i] === true;
        if (!isEnd) continue;
        const landsOn = start + ((lands[beats.length] as number) % (i - start + 1));
        beats.push({
          ...beatOf(beats.length + 1, start, i, landsOn, seams[beats.length] as string),
          lead: leads[beats.length] as StoryBeat['lead'],
        });
        start = i + 1;
      }
      return { beats, tailMs };
    });
};

describe('timeBeats', () => {
  it('tiles random valid storyboards: integer ms, contiguous, ending with the voiceover', () => {
    fc.assert(
      fc.property(
        wordsArb.chain((words) =>
          fc.record({
            words: fc.constant(words),
            extra: fc.integer({ min: 0, max: 1500 }),
            board: boardArb(words),
          }),
        ),
        ({ words, extra, board }) => {
          const durationMs = (words[words.length - 1] as FilmWord).endMs + extra;
          const storyboard = { ...board, beats: board.beats };
          // The generated storyboards are valid, so the schema accepts them.
          expect(
            StoryboardSchema.safeParse({
              title: 'Title',
              thesis: 'A thesis',
              world: 'A world',
              carrier: 'A carrier',
              props: [],
              beats: storyboard.beats.map((b) => ({ ...b, text: [] })),
            }).success,
          ).toBe(true);

          const timed = timeBeats(boardOf(storyboard.beats), words, durationMs);
          expect(timed).toHaveLength(storyboard.beats.length);
          expect((timed[0] as (typeof timed)[number]).startMs).toBe(0);
          timed.forEach((b, i) => {
            expect(Number.isInteger(b.startMs)).toBe(true);
            expect(Number.isInteger(b.endMs)).toBe(true);
            if (i < timed.length - 1) expect(b.endMs).toBe(timed[i + 1]?.startMs);
            // Words have increasing times, so every beat has a positive length.
            expect(b.endMs).toBeGreaterThan(b.startMs);
          });
          expect((timed[timed.length - 1] as (typeof timed)[number]).endMs).toBe(durationMs);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('gives a tail of 0 on the last beat, and never more than half of the next beat', () => {
    fc.assert(
      fc.property(
        wordsArb.chain((words) =>
          fc.record({
            words: fc.constant(words),
            extra: fc.integer({ min: 0, max: 1500 }),
            board: boardArb(words),
          }),
        ),
        ({ words, extra, board }) => {
          const durationMs = (words[words.length - 1] as FilmWord).endMs + extra;
          const timed = timeBeats(boardOf(board.beats), words, durationMs);
          const last = timed[timed.length - 1];
          expect(last?.tailMs).toBe(0);
          timed.forEach((b, i) => {
            const next = timed[i + 1];
            if (!next) return;
            const nextLen = next.endMs - next.startMs;
            expect(b.tailMs).toBeGreaterThanOrEqual(0);
            expect(b.tailMs).toBeLessThanOrEqual(Math.floor(nextLen / 2));
          });
        },
      ),
      { numRuns: 200 },
    );
  });

  it('keeps the key moment inside its beat', () => {
    fc.assert(
      fc.property(
        wordsArb.chain((words) =>
          fc.record({
            words: fc.constant(words),
            extra: fc.integer({ min: 0, max: 1500 }),
            board: boardArb(words),
          }),
        ),
        ({ words, extra, board }) => {
          const durationMs = (words[words.length - 1] as FilmWord).endMs + extra;
          for (const b of timeBeats(boardOf(board.beats), words, durationMs)) {
            expect(b.keyMomentMs).toBeGreaterThanOrEqual(0);
            expect(b.keyMomentMs).toBeLessThanOrEqual(b.endMs - b.startMs);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('starts a beat up to 250 ms before its first word, not before the previous word ends', () => {
    const words = wordsWith([0, 0, 0, 0], [500, 500, 500, 500]);
    const timed = timeBeats(boardOf([beatOf(1, 0, 1, 0), beatOf(2, 2, 3, 2)]), words, 2000);
    // Word 2 starts at 1000; the lead-in is 250 ms, and word 1 ends at 1000 too.
    expect(timed[1]?.startMs).toBe(1000);
    expect(timed[1]?.keyMomentMs).toBe(0);
  });
});

// ---- storyboardIssues ------------------------------------------------------------------------

/** Four beats of four words each, every beat long enough, no figures. Tiles 16 words. */
function validBoard(): { board: Storyboard; words: FilmWord[]; durationMs: number } {
  const words = wordsWith(
    Array.from({ length: 16 }, () => 100),
    Array.from({ length: 16 }, () => 400),
  );
  const beats = [0, 4, 8, 12].map((s, i) => ({
    ...beatOf(i + 1, s, s + 3, s + 1),
    id: `b${i + 1}`,
    text: ['A short label'],
  }));
  const board: Storyboard = {
    title: 'A film',
    thesis: 'One idea',
    world: 'A harbour at dawn',
    carrier: 'the ship',
    props: [],
    beats,
  };
  return { board, words, durationMs: (words[15] as FilmWord).endMs };
}

const issuesOf = (
  mutate: (b: Storyboard, words: FilmWord[]) => void,
): { issues: string[]; words: FilmWord[] } => {
  const { board, words, durationMs } = validBoard();
  mutate(board, words);
  return { issues: storyboardIssues(board, words, durationMs), words };
};

describe('storyboardIssues', () => {
  it('is empty for a board that tiles the words and fits every rule', () => {
    const { board, words, durationMs } = validBoard();
    expect(storyboardIssues(board, words, durationMs)).toEqual([]);
  });

  it('is empty for random boards built to tile the words with 4 to 12 words per beat', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 4, max: 12 }), { minLength: 1, maxLength: 6 }),
        (sizes) => {
          const n = sizes.reduce((a, b) => a + b, 0);
          // Words 500 ms apart: a beat of k words runs about k × 500 ms, always inside 1.6–9 s.
          const words = wordsWith(
            Array.from({ length: n }, () => 100),
            Array.from({ length: n }, () => 400),
          );
          let at = 0;
          const beats = sizes.map((k, i) => {
            const b = { ...beatOf(i + 1, at, at + k - 1, at), id: `b${i + 1}`, text: ['Label'] };
            at += k;
            return b;
          });
          const board: Storyboard = {
            title: 'A film',
            thesis: 'One idea',
            world: 'A world',
            carrier: 'a carrier',
            props: [],
            beats,
          };
          expect(storyboardIssues(board, words, n * 500)).toEqual([]);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('reports a gap between beats', () => {
    const { issues } = issuesOf((b) => {
      b.beats[1] = { ...(b.beats[1] as StoryBeat), wordStart: 5 };
    });
    expect(issues.join('\n')).toMatch(/wordStart is 5 but the previous beat ended at word 3/);
  });

  it('reports an overlap between beats', () => {
    const { issues } = issuesOf((b) => {
      b.beats[1] = { ...(b.beats[1] as StoryBeat), wordStart: 3 };
    });
    expect(issues.join('\n')).toMatch(/wordStart is 3/);
  });

  it('reports a hero that lands outside its beat', () => {
    const { issues } = issuesOf((b) => {
      b.beats[0] = { ...(b.beats[0] as StoryBeat), landsOn: 9 };
    });
    expect(issues.join('\n')).toMatch(/landsOn 9 is outside its words 0–3/);
  });

  it('reports on-screen text over 14 words', () => {
    const fifteen = Array.from({ length: FILM_MAX_TEXT_WORDS + 1 }, (_, i) => word(i)).join(' ');
    const { issues } = issuesOf((b) => {
      b.beats[0] = { ...(b.beats[0] as StoryBeat), text: [fifteen] };
    });
    expect(issues.join('\n')).toMatch(/15 words of on-screen text/);
  });

  it('reports a beat shorter than 1.6 s', () => {
    // Words are 500 ms apart, starting at 100 ms. Beat 1 has two words and ends where word 2 is
    // about to start (1000 ms), so it lasts 1.0 s.
    const words = wordsWith(
      Array.from({ length: 10 }, () => 100),
      Array.from({ length: 10 }, () => 400),
    );
    const board: Storyboard = {
      title: 'A film',
      thesis: 'One idea',
      world: 'A world',
      carrier: 'a carrier',
      props: [],
      beats: [
        { ...beatOf(1, 0, 1, 0), id: 'b1' },
        { ...beatOf(2, 2, 5, 2), id: 'b2' },
        { ...beatOf(3, 6, 9, 6), id: 'b3' },
      ],
    };
    const issues = storyboardIssues(board, words, 4000);
    expect(FILM_MIN_BEAT_MS).toBe(1600);
    expect(issues.join('\n')).toMatch(/beat b1 lasts 1\.0 s, too short to land an idea/);
  });

  it('reports a beat longer than 9 s', () => {
    const words = wordsWith(
      Array.from({ length: 28 }, () => 100),
      Array.from({ length: 28 }, () => 400),
    );
    const board: Storyboard = {
      title: 'A film',
      thesis: 'One idea',
      world: 'A world',
      carrier: 'a carrier',
      props: [],
      beats: [
        { ...beatOf(1, 0, 3, 0), id: 'b1' },
        { ...beatOf(2, 4, 23, 4), id: 'b2' },
        { ...beatOf(3, 24, 27, 24), id: 'b3' },
      ],
    };
    expect(storyboardIssues(board, words, 14_000).join('\n')).toMatch(
      /beat b2 lasts 10\.0 s: split it/,
    );
  });

  it('reports too many beats led by type', () => {
    const { issues } = issuesOf((b) => {
      for (const i of [0, 1, 2]) b.beats[i] = { ...(b.beats[i] as StoryBeat), lead: 'type' };
    });
    expect(issues.join('\n')).toMatch(/3 beats are led by type; at most 2 may be/);
  });

  it('reports a figure on screen that the narration never says', () => {
    const { issues } = issuesOf((b) => {
      b.beats[0] = { ...(b.beats[0] as StoryBeat), text: ['Revenue up 40%'] };
    });
    expect(issues.join('\n')).toMatch(/shows 40, which the narration never says/);
  });

  it('reports bad and repeated prop ids', () => {
    const { board, words, durationMs } = validBoard();
    board.props = [
      { id: 'Ship', draw: 'a ship in profile', width: 10, height: 10 },
      { id: 'boat', draw: 'a boat in profile', width: 10, height: 10 },
      { id: 'boat', draw: 'a boat again', width: 10, height: 10 },
    ];
    const issues = storyboardIssues(board, words, durationMs).join('\n');
    expect(issues).toMatch(/prop id "Ship" must be lowercase/);
    expect(issues).toMatch(/prop id "boat" is used twice/);
  });
});

// ---- spoken numbers ----------------------------------------------------------------------------

describe('numbers in the narration', () => {
  it.each([
    ['3,500 miles', '3500'],
    ['$9.6', '9.6'],
    ['12%', '12'],
    ['400-metre', '400'],
  ])('reads %s as %s', (text, figure) => {
    expect(numbersIn(text)).toEqual([figure]);
  });

  it('reads spelled-out small numbers as digits', () => {
    const spoken = spokenNumbers([{ text: 'Four' }, { text: 'and' }, { text: 'six' }]);
    expect(spoken.has('4')).toBe(true);
    expect(spoken.has('6')).toBe(true);
    expect(spoken.has('5')).toBe(false);
  });

  it('never flags the counting numbers 0 to 10', () => {
    const text = Array.from({ length: 11 }, (_, i) => String(i)).join(' ');
    expect(unspokenNumbers(text, new Set())).toEqual([]);
  });

  it('flags a figure the narration does not say, including 11', () => {
    expect(unspokenNumbers('11 and 12%', new Set())).toEqual(['11', '12']);
  });

  it('never reports a figure taken from the words', () => {
    const figureArb = fc
      .integer({ min: 0, max: 99_999 })
      .chain((n) =>
        fc.constantFrom(
          String(n),
          n.toLocaleString('en-US'),
          `${n}%`,
          `$${n}.5`,
          `${n}.25`,
          `${n},000`,
        ),
      );
    fc.assert(
      fc.property(
        fc.array(figureArb, { minLength: 1, maxLength: 12 }),
        fc.nat(),
        (figures, pick) => {
          const words = figures.map((text) => ({ text }));
          const spoken = spokenNumbers(words);
          const said = figures[pick % figures.length] as string;
          expect(unspokenNumbers(`Up ${said}`, spoken)).toEqual([]);
        },
      ),
      { numRuns: 300 },
    );
  });
});
