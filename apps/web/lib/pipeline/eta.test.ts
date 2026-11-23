import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  STEP_WEIGHTS,
  etaMs,
  formatEta,
  jobProgress,
  priorSeconds,
  type JobKind,
  type StepProgress,
} from './eta';
import { PIPELINE_STEPS, type StepState } from './events';

const KINDS: JobKind[] = ['video', 'voiceover'];
const kindArb = fc.constantFrom<JobKind>(...KINDS);

function steps(over: Partial<StepProgress> = {}, base: StepState = 'pending'): StepProgress {
  return {
    transcribe: base,
    clean: base,
    moments: base,
    suggest: base,
    plan: base,
    ...over,
  };
}

describe('STEP_WEIGHTS', () => {
  it.each(KINDS)('%s weights sum to 1', (kind) => {
    const sum = Object.values(STEP_WEIGHTS[kind]).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 10);
  });

  it('cover every pipeline step', () => {
    for (const kind of KINDS) {
      expect(Object.keys(STEP_WEIGHTS[kind]).sort()).toEqual([...PIPELINE_STEPS].sort());
    }
  });
});

describe('jobProgress', () => {
  it('is 0 when nothing has started and 1 when everything is done', () => {
    expect(jobProgress('video', steps())).toBe(0);
    expect(jobProgress('video', steps({}, 'done'))).toBeCloseTo(1, 10);
    expect(jobProgress('voiceover', steps({}, 'done'))).toBeCloseTo(1, 10);
  });

  it('counts skipped steps as done, but not failed ones', () => {
    expect(jobProgress('video', steps({ clean: 'skipped' }))).toBeCloseTo(0.1, 10);
    expect(jobProgress('video', steps({ clean: 'failed' }))).toBe(0);
  });

  it('adds the active step by its own fraction, half when unknown', () => {
    const s = steps({ transcribe: 'done', clean: 'done', moments: 'active' });
    expect(jobProgress('video', s, 1)).toBeCloseTo(0.25 + 0.1 + 0.15, 10);
    expect(jobProgress('video', s, 0)).toBeCloseTo(0.35, 10);
    expect(jobProgress('video', s)).toBeCloseTo(0.35 + 0.075, 10);
    expect(jobProgress('video', s, null)).toBeCloseTo(0.35 + 0.075, 10);
  });

  it('clamps the within-step fraction and ignores non-finite values', () => {
    const s = steps({ transcribe: 'active' });
    expect(jobProgress('video', s, 7)).toBeCloseTo(0.25, 10);
    expect(jobProgress('video', s, -3)).toBe(0);
    expect(jobProgress('video', s, Number.NaN)).toBe(0);
  });

  it('never decreases as steps advance in order (property)', () => {
    // Position k: steps before k/2 are done, an even k activates the next step.
    const at = (k: number): StepProgress => {
      const out = steps();
      PIPELINE_STEPS.forEach((step, i) => {
        const pos = k - i * 2;
        out[step] = pos < 0 ? 'pending' : pos === 0 ? 'active' : 'done';
      });
      return out;
    };
    fc.assert(
      fc.property(
        kindArb,
        fc.integer({ min: 0, max: 14 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (kind, n, within) => {
          expect(jobProgress(kind, at(n + 1), within)).toBeGreaterThanOrEqual(
            jobProgress(kind, at(n), within) - 1e-9,
          );
        },
      ),
    );
  });
});

describe('priorSeconds', () => {
  it('is the base plus the per-second rate, and never negative', () => {
    expect(priorSeconds('video', 0)).toBe(20);
    expect(priorSeconds('video', 60_000)).toBeCloseTo(20 + 36, 10);
    expect(priorSeconds('voiceover', 60_000)).toBeCloseTo(8 + 21, 10);
    expect(priorSeconds('video', -5000)).toBe(20);
  });
});

describe('etaMs', () => {
  it('is the prior while nothing has been observed', () => {
    const prior = priorSeconds('video', 30_000) * 1000;
    expect(etaMs({ kind: 'video', mediaMs: 30_000, progress: 0, elapsedMs: 0 })).toBe(
      Math.round(prior),
    );
    // Progress below the 2 % threshold is still "nothing observed".
    expect(etaMs({ kind: 'video', mediaMs: 30_000, progress: 0.01, elapsedMs: 9_000 })).toBe(
      Math.round(prior * 0.99),
    );
  });

  it('is the prior for what is left when preparation already covered the progress', () => {
    const prior = priorSeconds('video', 30_000) * 1000;
    expect(
      etaMs({
        kind: 'video',
        mediaMs: 30_000,
        progress: 0.3,
        elapsedMs: 5_000,
        startProgress: 0.3,
      }),
    ).toBe(Math.round(prior * 0.7));
  });

  it('is 0 at progress 1', () => {
    for (const kind of KINDS) {
      expect(etaMs({ kind, mediaMs: 120_000, progress: 1, elapsedMs: 40_000 })).toBe(0);
      expect(etaMs({ kind, mediaMs: 120_000, progress: 3, elapsedMs: 0 })).toBe(0);
    }
  });

  it('moves to the observed rate as progress grows', () => {
    // Half done after 10 s: 10 s left by the observed rate; the prior says far more.
    const eta = etaMs({ kind: 'video', mediaMs: 300_000, progress: 0.5, elapsedMs: 10_000 });
    expect(eta).toBe(10_000);
  });

  it('survives garbage input', () => {
    const eta = etaMs({
      kind: 'video',
      mediaMs: Number.NaN,
      progress: Number.NaN,
      elapsedMs: Number.NaN,
    });
    expect(Number.isFinite(eta)).toBe(true);
    expect(eta).toBeGreaterThanOrEqual(0);
  });
});

describe('formatEta', () => {
  it.each([
    [null, ''],
    [0, 'Almost done'],
    [4_999, 'Almost done'],
    [5_000, '~5s left'],
    [14_000, '~15s left'],
    [29_000, '~30s left'],
    [42_000, '~40s left'],
    [60_000, '~1 min left'],
    [89_000, '~1 min left'],
    [120_000, '~2 min left'],
    [330_000, '~6 min left'],
  ])('%s → %s', (ms, text) => {
    expect(formatEta(ms)).toBe(text);
  });

  it('never says "~60s" (rounds up to a minute instead)', () => {
    expect(formatEta(58_000)).toBe('~1 min left');
    expect(formatEta(57_600)).toBe('~1 min left');
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 3_600_000 }), (ms) => {
        expect(formatEta(ms)).not.toMatch(/~60s/);
      }),
    );
  });
});

describe('etaMs (property)', () => {
  const opts = fc.record({
    kind: kindArb,
    mediaMs: fc.integer({ min: 0, max: 3_600_000 }),
    elapsedMs: fc.integer({ min: 0, max: 3_600_000 }),
    progress: fc.double({ min: 0, max: 1, noNaN: true }),
    startProgress: fc.double({ min: 0, max: 1, noNaN: true }),
  });

  it('is finite and never negative', () => {
    fc.assert(
      fc.property(opts, (o) => {
        const eta = etaMs(o);
        expect(Number.isFinite(eta)).toBe(true);
        expect(eta).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: 500 },
    );
  });

  it('is 0 whenever progress is 1', () => {
    fc.assert(
      fc.property(opts, (o) => {
        expect(etaMs({ ...o, progress: 1 })).toBe(0);
      }),
    );
  });

  it('with progress fixed, it is never NaN as time passes', () => {
    fc.assert(
      fc.property(
        opts,
        fc.array(fc.integer({ min: 0, max: 600_000 }), { maxLength: 20 }),
        (o, ticks) => {
          let elapsedMs = o.elapsedMs;
          for (const dt of ticks) {
            elapsedMs += dt;
            const eta = etaMs({ ...o, elapsedMs });
            expect(Number.isNaN(eta)).toBe(false);
            expect(eta).toBeGreaterThanOrEqual(0);
          }
        },
      ),
    );
  });

  it('is finite even when preparation covered more than the current progress', () => {
    fc.assert(
      fc.property(opts, (o) => {
        expect(Number.isFinite(etaMs({ ...o, startProgress: 1 }))).toBe(true);
      }),
    );
  });
});
