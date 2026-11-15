import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { PAUSE_MIN_MS, prosody, type ProsodyWord } from './prosody';

const RATE = 24_000;

/** Seeded generator (mulberry32): the tests never touch Math.random. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Burst {
  text?: string;
  amp?: number;
  hz?: number;
  ms?: number;
  /** Unvoiced: seeded noise with this amplitude instead of a tone. */
  noise?: number;
  /** Silence after this word; default `gapMs`. */
  gap?: number;
}
const BASE = { text: 'aa', amp: 0.3, hz: 130, ms: 300 };

/** Tone (or noise) bursts with known amplitude, pitch and length, separated by silence. */
function signal(
  bursts: Burst[],
  opts: { gapMs?: number; leadMs?: number; trailMs?: number; seed?: number } = {},
) {
  const { gapMs = 100, leadMs = 0, trailMs = 0, seed = 1 } = opts;
  const rand = rng(seed);
  const total = (ms: number) => Math.round((ms / 1000) * RATE);
  const samples: number[] = [];
  const words: ProsodyWord[] = [];
  const silence = (ms: number) => {
    for (let k = 0; k < total(ms); k++) samples.push(0);
  };
  silence(leadMs);
  let t = leadMs;
  for (const b of bursts) {
    const { text, amp, hz, ms } = { ...BASE, ...b };
    for (let k = 0; k < total(ms); k++) {
      samples.push(
        b.noise === undefined
          ? amp * Math.sin((2 * Math.PI * hz * k) / RATE)
          : b.noise * (rand() * 2 - 1),
      );
    }
    words.push({ text, startMs: t, endMs: t + ms });
    const gap = b.gap ?? gapMs;
    silence(gap);
    t += ms + gap;
  }
  silence(trailMs);
  return { pcm: Float32Array.from(samples), words, durationMs: (samples.length / RATE) * 1000 };
}

const FIVE = (mid: Burst): Burst[] => [{}, {}, mid, {}, {}];

describe('prosody: one cue at a time', () => {
  const cues: [string, Burst][] = [
    ['loudest', { amp: 0.7 }],
    ['highest pitched', { hz: 230 }],
    ['longest per syllable', { ms: 700 }],
  ];
  for (const [name, burst] of cues) {
    for (const at of [0, 2, 4]) {
      it(`the ${name} word ranks above its neighbours (position ${at})`, () => {
        const bursts: Burst[] = [{}, {}, {}, {}, {}];
        bursts[at] = burst;
        const { pcm, words } = signal(bursts);
        const { stress } = prosody(pcm, RATE, words);
        stress.forEach((s, i) => {
          if (i !== at) expect(stress[at]).toBeGreaterThan(s);
        });
      });
    }
  }

  it('a longer word with more syllables is not ranked longer per syllable', () => {
    const { pcm, words } = signal(
      FIVE({ text: 'revenue', ms: 600 }).map((b, i) => (i === 2 ? b : { ...b, ms: 200 })),
    );
    const { stress } = prosody(pcm, RATE, words);
    // 'revenue' has 3 vowel groups: 200 ms per syllable, the same as the single-syllable words.
    expect(stress[2]).toBe(50);
  });

  it('a word with all three cues ranks top', () => {
    const { pcm, words } = signal(FIVE({ amp: 0.7, hz: 230, ms: 700 }));
    const { stress } = prosody(pcm, RATE, words);
    const top = stress[2] as number;
    for (const [i, s] of stress.entries()) if (i !== 2) expect(top).toBeGreaterThan(s);
    expect(top).toBeGreaterThanOrEqual(70);
  });

  it('a word with all three cues ranks top over uneven neighbours', () => {
    const { pcm, words } = signal([
      { amp: 0.25, hz: 120, ms: 280 },
      { amp: 0.4, hz: 150, ms: 340 },
      { amp: 0.8, hz: 240, ms: 800 },
      { amp: 0.3, hz: 110, ms: 250 },
      { amp: 0.45, hz: 160, ms: 400 },
    ]);
    const { stress } = prosody(pcm, RATE, words);
    expect(Math.max(...stress)).toBe(stress[2]);
  });
});

describe('prosody: unvoiced words', () => {
  it('noise-like words do not crash and get a finite stress', () => {
    const { pcm, words } = signal([
      { noise: 0.3 },
      { noise: 0.5, ms: 500 },
      { noise: 0.05 },
      { noise: 0.3, text: 'shh' },
    ]);
    const { stress } = prosody(pcm, RATE, words);
    expect(stress).toHaveLength(4);
    for (const s of stress) expect(Number.isFinite(s) && Number.isInteger(s)).toBe(true);
  });

  it('a mix of voiced and unvoiced words stays in range', () => {
    const { pcm, words } = signal([{}, { noise: 0.4 }, { amp: 0.6 }, { noise: 0.2 }, {}]);
    for (const s of prosody(pcm, RATE, words).stress) expect(s >= 0 && s <= 100).toBe(true);
  });
});

describe('prosody: pauses', () => {
  const near = (a: number, b: number) => Math.abs(a - b) <= 40;

  it.each([300, 320, 450, 800, 1500])('finds a %d ms pause at both ends within 40 ms', (gap) => {
    for (const lead of [0, 7, 13]) {
      const { pcm, words } = signal([{}, { gap }, {}, {}], { leadMs: lead, gapMs: 100 });
      const p = prosody(pcm, RATE, words);
      const found = p.pauses.filter((x) => x.endMs - x.startMs >= PAUSE_MIN_MS);
      expect(found).toHaveLength(1);
      expect(near(found[0]!.startMs, words[1]!.endMs)).toBe(true);
      expect(near(found[0]!.endMs, words[2]!.startMs)).toBe(true);
    }
  });

  it('finds a 300 ms pause whatever the 20 ms frame alignment', () => {
    for (let shift = 0; shift < 20; shift += 3) {
      const { pcm, words } = signal([{ ms: 300 + shift }, { gap: 300 }, {}]);
      const p = prosody(pcm, RATE, words);
      expect(p.pauses, `shift ${shift}`).toHaveLength(1);
    }
  });

  it.each([0, 80, 150, 250])('does not report a %d ms gap', (gap) => {
    const { pcm, words } = signal([{}, { gap }, {}, {}]);
    expect(prosody(pcm, RATE, words).pauses).toEqual([]);
  });

  it('finds leading and trailing silence', () => {
    const s = signal([{}, {}, {}], { leadMs: 600, trailMs: 700 });
    const { pauses } = prosody(s.pcm, RATE, s.words);
    expect(pauses).toHaveLength(2);
    expect(near(pauses[0]!.startMs, 0)).toBe(true);
    expect(near(pauses[0]!.endMs, s.words[0]!.startMs)).toBe(true);
    // The trailing silence is the last word's own 100 ms gap plus 700 ms.
    expect(near(pauses[1]!.startMs, s.words[2]!.endMs)).toBe(true);
    expect(near(pauses[1]!.endMs, s.durationMs)).toBe(true);
  });

  it('finds several pauses in order', () => {
    const { pcm, words } = signal([{ gap: 400 }, { gap: 100 }, { gap: 600 }, {}]);
    const { pauses } = prosody(pcm, RATE, words);
    expect(pauses).toHaveLength(2);
    expect(near(pauses[0]!.startMs, words[0]!.endMs)).toBe(true);
    expect(near(pauses[1]!.startMs, words[2]!.endMs)).toBe(true);
  });
});

describe('prosody: words beyond the audio', () => {
  it('words that start past the end stay at 50', () => {
    const { pcm, words } = signal(FIVE({ amp: 0.7 }));
    const end = (pcm.length / RATE) * 1000;
    const extra: ProsodyWord[] = [
      { text: 'late', startMs: end + 10, endMs: end + 400 },
      { text: 'later', startMs: end + 900, endMs: end + 1500 },
    ];
    const { stress } = prosody(pcm, RATE, [...words, ...extra]);
    expect(stress).toHaveLength(7);
    expect(stress.slice(5)).toEqual([50, 50]);
    expect(stress[2]).toBeGreaterThan(50);
  });

  it('a word partly past the end is still finite and in range', () => {
    const { pcm, words } = signal(FIVE({}));
    const end = (pcm.length / RATE) * 1000;
    const { stress } = prosody(pcm, RATE, [
      ...words,
      { text: 'x', startMs: end - 50, endMs: end + 500 },
    ]);
    expect(Number.isInteger(stress[5])).toBe(true);
  });
});

describe('prosody: properties', () => {
  const RATES = [8000, 16_000, 24_000, 44_100, 48_000];
  const wordsArb = (durationMs: number) =>
    fc.array(
      fc
        .tuple(
          fc.integer({ min: 0, max: durationMs + 500 }),
          fc.integer({ min: 0, max: 900 }),
          fc.constantFrom('a', 'the', 'revenue', 'forty', 'percent', 'x', 'sh'),
        )
        .map(([startMs, len, text]) => ({ text, startMs, endMs: startMs + len })),
      { maxLength: 25 },
    );
  const audioArb = fc
    .tuple(fc.integer(), fc.constantFrom(...RATES), fc.integer({ min: 0, max: 2500 }))
    .chain(([seed, rate, ms]) =>
      wordsArb(ms).map((words) => {
        const rand = rng(seed);
        const n = Math.round((ms / 1000) * rate);
        const pcm = new Float32Array(n);
        // Bursts of tone and silence so pauses and pitch both occur.
        for (let i = 0; i < n; i++) {
          const on = Math.floor(i / (rate * 0.35)) % 3 !== 2;
          pcm[i] = on ? 0.4 * Math.sin((2 * Math.PI * 150 * i) / rate) * (0.5 + rand()) : 0;
        }
        return { pcm, rate, words };
      }),
    );

  it('is deterministic, in range, ordered and does not mutate its input', () => {
    fc.assert(
      fc.property(audioArb, ({ pcm, rate, words }) => {
        const copy = Float32Array.from(pcm);
        const a = prosody(pcm, rate, words);
        expect(prosody(pcm, rate, words)).toEqual(a);
        // Byte compare: the same check as toEqual, without a deep walk over up to 120,000
        // samples (this property took 5.4 s under the full forced suite on 2026-11-15).
        expect(Buffer.from(pcm.buffer).equals(Buffer.from(copy.buffer))).toBe(true);
        expect(a.v).toBe(1);
        expect(a.stress).toHaveLength(words.length);
        for (const s of a.stress) expect(Number.isInteger(s) && s >= 0 && s <= 100).toBe(true);
        const audioMs = (pcm.length / rate) * 1000;
        let prevEnd = 0;
        for (const p of a.pauses) {
          expect(p.startMs).toBeGreaterThanOrEqual(prevEnd);
          expect(p.endMs - p.startMs).toBeGreaterThanOrEqual(PAUSE_MIN_MS);
          // 1e-6: `length / rate * 1000` can come out a hair under a whole ms (1008.9999999999999
          // for audio that is exactly 1009 ms), which failed this property about one run in ten.
          expect(p.endMs).toBeLessThanOrEqual(audioMs + 1e-6);
          prevEnd = p.endMs;
        }
      }),
      { numRuns: 150 },
    );
  });

  it('gives stress 50 everywhere for all-zero audio', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...RATES),
        fc.integer({ min: 0, max: 3000 }),
        fc.array(
          fc
            .tuple(fc.integer({ min: 0, max: 4000 }), fc.integer({ min: 0, max: 800 }))
            .map(([startMs, len]) => ({ text: 'word', startMs, endMs: startMs + len })),
          { maxLength: 20 },
        ),
        (rate, ms, words) => {
          const p = prosody(new Float32Array(Math.round((ms / 1000) * rate)), rate, words);
          expect(p.stress).toEqual(words.map(() => 50));
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('prosody: timing', () => {
  it('analyses 3 minutes of 24 kHz audio with 450 words quickly', () => {
    const rand = rng(7);
    const bursts: Burst[] = [];
    for (let i = 0; i < 450; i++) {
      bursts.push({
        text: ['we', 'revenue', 'grew', 'forty', 'percent'][i % 5] as string,
        amp: 0.2 + rand() * 0.3,
        hz: 100 + rand() * 120,
        ms: 250 + Math.round(rand() * 100),
        gap: 50 + Math.round(rand() * 100),
      });
    }
    // 450 words at about 0.4 s each is 3 minutes.
    const { pcm, words, durationMs } = signal(bursts, { gapMs: 0 });
    expect(durationMs).toBeGreaterThan(170_000);
    expect(durationMs).toBeLessThan(190_000);
    prosody(pcm, RATE, words); // warm-up
    const runs: number[] = [];
    for (let i = 0; i < 3; i++) {
      const t0 = performance.now();
      const p = prosody(pcm, RATE, words);
      runs.push(performance.now() - t0);
      expect(p.stress).toHaveLength(450);
    }
    const best = Math.min(...runs);
    console.log(
      `prosody timing: ${(durationMs / 1000).toFixed(0)} s audio, 450 words: ` +
        runs.map((r) => `${r.toFixed(0)} ms`).join(', '),
    );
    expect(best).toBeLessThan(1500);
  });
});
