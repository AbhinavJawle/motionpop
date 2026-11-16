import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../core/rng';
import { SFX_SAMPLE_RATE, dbToGain, gainToDb, peakOf } from './dsp';
import { DUCK_FRAME_MS, duckDbAt, duckEnvelope } from './duck';
import { LEVEL_FLOOR_DB, rmsDb, shortTermLevelDb, speechSpans, voiceLevelDb } from './level';
import { limit } from './limiter';
import { bedKey, mixBed, type BedInput, type BedKeyInput, type BedSfx } from './mix';
import { SFX_KINDS, SFX_TAKES } from './synth';

const SR = SFX_SAMPLE_RATE;

/** Seeded noise at a given RMS-ish amplitude. */
const noise = (n: number, amp: number, seed = 1) => {
  const r = mulberry32(seed);
  return Float32Array.from({ length: n }, () => (r() * 2 - 1) * amp);
};

// ---------- level ----------

describe('levels', () => {
  it('rmsDb of a full-scale square wave is 0 dB and silence is the floor', () => {
    const sq = Float32Array.from({ length: 1000 }, (_, i) => (i % 2 ? 1 : -1));
    expect(rmsDb(sq)).toBeCloseTo(0, 6);
    expect(rmsDb(new Float32Array(100))).toBe(LEVEL_FLOOR_DB);
    expect(rmsDb(new Float32Array(0))).toBe(LEVEL_FLOOR_DB);
  });

  it('voiceLevelDb measures the word regions only', () => {
    // 1 s of loud noise in the word, 1 s of silence around it.
    const x = new Float32Array(3 * SR);
    x.set(noise(SR, 0.5), SR);
    const all = rmsDb(x);
    const voice = voiceLevelDb(x, SR, [{ startMs: 1000, endMs: 2000 }]);
    expect(voice).toBeCloseTo(rmsDb(x, SR, 2 * SR), 6);
    expect(voice - all).toBeCloseTo(gainToDb(Math.sqrt(3)), 1);
    expect(voiceLevelDb(x, SR, [])).toBeCloseTo(all, 6);
  });

  it('shortTermLevelDb finds the loudest 50 ms', () => {
    const x = new Float32Array(SR);
    x.fill(0.5, 12_000, 12_000 + 1200);
    expect(shortTermLevelDb(x, SR, 50)).toBeCloseTo(gainToDb(0.5), 4);
  });

  it('speechSpans merges gaps under the threshold and keeps a 400 ms pause apart', () => {
    const w = [
      { startMs: 0, endMs: 300 },
      { startMs: 500, endMs: 800 },
      { startMs: 1200, endMs: 1500 },
    ];
    expect(speechSpans(w, 400)).toEqual([
      { startMs: 0, endMs: 800 },
      { startMs: 1200, endMs: 1500 },
    ]);
  });
});

// ---------- ducking (property 8) ----------

const wordsArb = fc
  .array(fc.tuple(fc.integer({ min: 0, max: 900 }), fc.integer({ min: 40, max: 700 })), {
    maxLength: 30,
  })
  .map((parts) => {
    let t = 0;
    return parts.map(([gap, len]) => {
      const startMs = t + gap;
      t = startMs + len;
      return { startMs, endMs: t };
    });
  });

describe('duckEnvelope', () => {
  it('cases: ducks 80 ms after speech starts, keeps short pauses down, releases over 400 ms', () => {
    const env = duckEnvelope(
      [
        { startMs: 1000, endMs: 2000 },
        { startMs: 2200, endMs: 3000 }, // 200 ms pause: stays ducked
      ],
      5000,
      { depthDb: 8 },
    );
    expect(env.length).toBe(500);
    expect(env[99]).toBe(0);
    expect(env[100]).toBe(-1);
    expect(env[107]).toBe(-8);
    expect(env[210]).toBe(-8); // inside the short pause
    expect(env[300]).toBeCloseTo(-8 + 8 / 40, 5);
    expect(env[339]).toBe(0);
    expect(duckDbAt(env, 1075)).toBeCloseTo(-8, 5);
    expect(duckDbAt(env, -5)).toBe(0);
  });

  it('a depth of 0 is flat', () => {
    expect(
      duckEnvelope([{ startMs: 0, endMs: 900 }], 1000, { depthDb: 0 }).every((v) => v === 0),
    ).toBe(true);
  });

  it('property 8: within [-depth, 0], exactly -depth after the attack, slopes respected', () => {
    fc.assert(
      fc.property(
        wordsArb,
        fc.integer({ min: 0, max: 24 }),
        fc.integer({ min: 500, max: 12_000 }),
        (words, depth, durationMs) => {
          const env = duckEnvelope(words, durationMs, { depthDb: depth });
          expect(env.length).toBe(Math.ceil(durationMs / DUCK_FRAME_MS));
          const down = (depth * DUCK_FRAME_MS) / 80 + 1e-5;
          const up = (depth * DUCK_FRAME_MS) / 400 + 1e-5;
          const regions = speechSpans(words, 400);
          const bad: string[] = [];
          for (let f = 0; f < env.length; f++) {
            const v = env[f] as number;
            if (v < -depth || v > 0) bad.push(`range ${f}`);
            const d = v - (f > 0 ? (env[f - 1] as number) : 0);
            if (d < -down || d > up) bad.push(`slope ${f}`);
            const t = f * DUCK_FRAME_MS;
            const r = regions.find((s) => s.startMs <= t && t < s.endMs);
            if (r && t - r.startMs >= 80 && v !== -depth) bad.push(`not ducked ${f}`);
            // Fully released 400 ms after a region, before the next one.
            if (!r && regions.every((s) => s.endMs + 400 <= t || s.startMs > t) && v !== 0) {
              bad.push(`not released ${f}`);
            }
          }
          expect(bad).toEqual([]);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------- limiter ----------

describe('limit', () => {
  it('keeps a hot signal at or under -1 dBFS and leaves a quiet one untouched', () => {
    const hot = noise(SR / 4, 3);
    expect(gainToDb(peakOf(limit(hot, SR)))).toBeLessThanOrEqual(-1);
    const quiet = noise(SR / 4, 0.3);
    expect(Array.from(limit(quiet, SR))).toEqual(Array.from(quiet));
  });

  it('ramps the gain down before a lone spike instead of clipping it', () => {
    const x = new Float32Array(2400).fill(0.5);
    x[1200] = 4;
    const y = limit(x, SR);
    expect(Math.abs(y[1200] as number)).toBeLessThanOrEqual(dbToGain(-1));
    expect(y[1200 - 121]).toBeCloseTo(0.5, 6); // before the 5 ms look-ahead
    expect(y[1200 - 60]! < 0.5).toBe(true); // ramping inside it
  });
});

// ---------- the bed (property 9) ----------

const sfxArb: fc.Arbitrary<BedSfx> = fc
  .record({
    kind: fc.constantFrom(...SFX_KINDS),
    take: fc.nat({ max: 5 }),
    atMs: fc.integer({ min: -500, max: 3500 }),
    gainDb: fc.constantFrom(0, -6),
  })
  .map((s) => ({ ...s, take: s.take % SFX_TAKES[s.kind] }));

const bedArb = fc.record({
  durationMs: fc.integer({ min: 1, max: 2000 }),
  voiceLevelDb: fc.integer({ min: -40, max: 0 }),
  music: fc.option(
    fc.record({ amp: fc.double({ min: 0.01, max: 2, noNaN: true }), seed: fc.nat() }),
    {
      nil: null,
    },
  ),
  musicGainDb: fc.integer({ min: -40, max: 0 }),
  ducking: fc.boolean(),
  duckDepthDb: fc.integer({ min: 0, max: 24 }),
  words: wordsArb,
  sfx: fc.array(sfxArb, { maxLength: 6 }),
  sfxGainDb: fc.integer({ min: -24, max: 6 }),
});

type BedCase = typeof bedArb extends fc.Arbitrary<infer T> ? T : never;

function inputOf(c: BedCase): BedInput {
  const n = Math.round(c.durationMs * 24);
  const music = c.music ? noise(n, c.music.amp, c.music.seed) : null;
  return {
    durationMs: c.durationMs,
    sampleRate: 24000,
    voiceLevelDb: c.voiceLevelDb,
    music: music ? { samples: music, levelDb: rmsDb(music) } : null,
    musicGainDb: c.musicGainDb,
    ducking: c.ducking,
    duckDepthDb: c.duckDepthDb,
    envelope: c.ducking ? duckEnvelope(c.words, c.durationMs, { depthDb: c.duckDepthDb }) : null,
    sfx: c.sfx,
    sfxGainDb: c.sfxGainDb,
  };
}

function keyOf(c: BedCase, voiceSrc = 'idb:voice'): BedKeyInput {
  const i = inputOf(c);
  return {
    durationMs: i.durationMs,
    voiceSrc,
    voiceLevelDb: i.voiceLevelDb,
    music: c.music ? { id: 'own', src: `idb:m-${c.music.seed}-${c.music.amp}` } : null,
    musicGainDb: i.musicGainDb,
    ducking: i.ducking,
    duckDepthDb: i.duckDepthDb,
    envelope: i.envelope,
    sfx: i.sfx,
    sfxGainDb: i.sfxGainDb,
  };
}

describe('mixBed', () => {
  it('property 9: deterministic, exact length, finite, peak <= -1 dBFS', () => {
    fc.assert(
      fc.property(bedArb, (c) => {
        const a = mixBed(inputOf(c));
        const b = mixBed(inputOf(c));
        expect(a.samples.length).toBe(c.durationMs * 24);
        expect(a.samples.every((v, k) => v === b.samples[k])).toBe(true);
        expect(a.peakDb).toBe(b.peakDb);
        expect(a.samples.every(Number.isFinite)).toBe(true);
        expect(a.peakDb).toBeLessThanOrEqual(-1);
        expect(gainToDb(peakOf(a.samples))).toBeLessThanOrEqual(-1);
      }),
      { numRuns: 60 },
    );
  });

  it('property 9: equal inputs give equal keys; changing any input changes the key', () => {
    fc.assert(
      fc.property(bedArb, (c) => {
        const base = keyOf(c);
        const k = bedKey(base);
        expect(bedKey(keyOf(structuredClone(c)))).toBe(k);
        expect(k).toMatch(/^[0-9a-f]{16}$/);
        expect(bedKey({ ...base, voiceSrc: 'idb:voice-cleaned' })).not.toBe(k);
        expect(bedKey({ ...base, voiceLevelDb: c.voiceLevelDb - 1 })).not.toBe(k);
        expect(bedKey({ ...base, durationMs: c.durationMs + 1 })).not.toBe(k);
        expect(
          bedKey({ ...base, sfx: [...c.sfx, { kind: 'pop', take: 0, atMs: 1, gainDb: 0 }] }),
        ).not.toBe(k);
        if (c.sfx.length > 0) {
          expect(bedKey({ ...base, sfxGainDb: c.sfxGainDb + 1 })).not.toBe(k);
          const moved = c.sfx.map((s, i) => (i === 0 ? { ...s, atMs: s.atMs + 1 } : s));
          expect(bedKey({ ...base, sfx: moved })).not.toBe(k);
        }
        if (c.music) {
          expect(bedKey({ ...base, musicGainDb: c.musicGainDb - 1 })).not.toBe(k);
          expect(bedKey({ ...base, music: { id: 'calm-pad' } })).not.toBe(k);
          expect(bedKey({ ...base, music: null })).not.toBe(k);
          expect(bedKey({ ...base, ducking: !c.ducking })).not.toBe(k);
        }
      }),
      { numRuns: 60 },
    );
  });

  it('places music at voice + musicGainDb and ducks it by the depth under speech', () => {
    const durationMs = 3000;
    const music = noise(durationMs * 24, 0.3, 9);
    const words = [{ startMs: 1000, endMs: 2000 }];
    const out = mixBed({
      durationMs,
      sampleRate: 24000,
      voiceLevelDb: -20,
      music: { samples: music, levelDb: rmsDb(music) },
      musicGainDb: -18,
      ducking: true,
      duckDepthDb: 8,
      envelope: duckEnvelope(words, durationMs, { depthDb: 8 }),
      sfx: [],
      sfxGainDb: 0,
    });
    const pause = rmsDb(out.samples, 0, 0.9 * SR);
    const speech = rmsDb(out.samples, 1.2 * SR, 1.9 * SR);
    expect(pause).toBeCloseTo(-38, 0);
    expect(pause - speech).toBeCloseTo(8, 0);
  });

  it('lands an effect peak on atMs at voice - 6 dB plus the kind offset', () => {
    const out = mixBed({
      durationMs: 2000,
      sampleRate: 24000,
      voiceLevelDb: -20,
      music: null,
      musicGainDb: -18,
      ducking: false,
      duckDepthDb: 8,
      envelope: null,
      sfx: [{ kind: 'pop', take: 0, atMs: 1000, gainDb: 0 }],
      sfxGainDb: 0,
    });
    let at = 0;
    for (let i = 0; i < out.samples.length; i++)
      if (Math.abs(out.samples[i]!) > Math.abs(out.samples[at]!)) at = i;
    expect(Math.abs((at * 1000) / SR - 1000)).toBeLessThanOrEqual(1);
    expect(shortTermLevelDb(out.samples, SR)).toBeCloseTo(-26, 1);
  });

  it('an empty bed is silent with a JSON-safe peak', () => {
    const out = mixBed({
      durationMs: 500,
      sampleRate: 24000,
      voiceLevelDb: Number.NaN,
      music: null,
      musicGainDb: 0,
      ducking: true,
      duckDepthDb: 8,
      envelope: null,
      sfx: [],
      sfxGainDb: 0,
    });
    expect(out.samples.every((v) => v === 0)).toBe(true);
    expect(out.peakDb).toBe(-120);
  });
});
