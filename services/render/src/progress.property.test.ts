// P8 (spec 08 §19): the progress throttle over random callback streams and clocks.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { renderDocIssues } from '@motionpop/schemas';
import type { JobStage } from './ports';
import { DEFAULT_THROTTLE, ProgressThrottle, mapProgress, stageOf } from './progress';
import { makeHarness } from './testing/harness';

type Offer = { stage: JobStage; candidate: number; dt: number };

const candidate = fc.oneof(
  { weight: 8, arbitrary: fc.integer({ min: 0, max: 100 }) },
  { weight: 2, arbitrary: fc.double({ min: -50, max: 150, noNaN: true }) },
  { weight: 1, arbitrary: fc.constantFrom(Number.NaN, Infinity, -Infinity) },
);
const offers = fc.array(
  fc.record({
    stage: fc.constantFrom<JobStage>('rendering', 'encoding'),
    candidate,
    // Mostly small steps forward, sometimes none, sometimes the clock goes back.
    dt: fc.oneof(
      fc.integer({ min: 0, max: 400 }),
      fc.integer({ min: 0, max: 3000 }),
      fc.integer({ min: -2000, max: 0 }),
    ),
  }),
  { maxLength: 200 },
);

interface Write {
  at: number;
  stage: JobStage;
  progress: number;
}

function run(stream: Offer[]): { writes: Write[]; t: ProgressThrottle } {
  const t = new ProgressThrottle();
  const writes: Write[] = [];
  let now = 0;
  for (const o of stream) {
    now += o.dt;
    const d = t.offer(o.stage, o.candidate, now);
    if (d.write) writes.push({ at: now, stage: d.stage, progress: d.progress });
  }
  return { writes, t };
}

describe('P8 progress throttle', () => {
  it('writes integers in 0–100 that never decrease, and a stage that never goes back', () => {
    fc.assert(
      fc.property(offers, (stream) => {
        const { writes } = run(stream);
        let prev: Write | undefined;
        for (const w of writes) {
          expect(Number.isInteger(w.progress)).toBe(true);
          expect(w.progress).toBeGreaterThanOrEqual(0);
          expect(w.progress).toBeLessThanOrEqual(100);
          if (prev) {
            expect(w.progress).toBeGreaterThanOrEqual(prev.progress);
            if (prev.stage === 'encoding') expect(w.stage).toBe('encoding');
          }
          prev = w;
        }
      }),
      { numRuns: 300 },
    );
  });

  it('writes at most once a second and only for a move of 2 points, unless the stage changed (R4.2)', () => {
    fc.assert(
      fc.property(offers, (stream) => {
        const { writes } = run(stream);
        let prev: Write | undefined;
        for (const w of writes) {
          if (prev && prev.stage === w.stage) {
            expect(w.at - prev.at).toBeGreaterThanOrEqual(DEFAULT_THROTTLE.minIntervalMs);
            expect(w.progress - prev.progress).toBeGreaterThanOrEqual(DEFAULT_THROTTLE.minDelta);
          }
          prev = w;
        }
      }),
      { numRuns: 300 },
    );
  });

  it('never writes more than one per second plus the stage changes, on a forward clock', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            stage: fc.constantFrom<JobStage>('rendering', 'encoding'),
            candidate: fc.integer({ min: 0, max: 100 }),
            dt: fc.integer({ min: 0, max: 700 }),
          }),
          { maxLength: 300 },
        ),
        (stream) => {
          const { writes } = run(stream);
          const span = stream.reduce((n, o) => n + o.dt, 0);
          // A stage can change once (rendering → encoding), so at most one extra write.
          expect(writes.length).toBeLessThanOrEqual(Math.floor(span / 1000) + 2);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('writes when the move and the gap are big enough (it does not starve)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 96 }),
        fc.integer({ min: 2, max: 3 }),
        fc.integer({ min: 1000, max: 60_000 }),
        (start, delta, gap) => {
          const t = new ProgressThrottle();
          t.offer('rendering', start + 2, 0);
          const before = t.written.progress;
          const d = t.offer('rendering', before + delta, gap + 1);
          expect(d.write).toBe(true);
          expect(t.written.progress).toBe(Math.min(100, before + delta));
        },
      ),
      { numRuns: 200 },
    );
  });

  it('keeps the doc valid at every step when the writes go to the store (with P4’s rules)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            status: fc.constantFrom('preprocessing', 'rendering', 'encoding', 'assembling'),
            percent: candidate,
            dt: fc.integer({ min: 0, max: 1500 }),
          }),
          { maxLength: 60 },
        ),
        async (stream) => {
          const h = await makeHarness();
          await h.store.markStarted(h.renderId);
          const throttle = new ProgressThrottle();
          let now = 0;
          let last = h.doc.progress;
          for (const e of stream) {
            now += e.dt;
            const stage = stageOf(e.status);
            const d = throttle.offer(stage, mapProgress(stage, e.percent), now);
            if (!d.write) continue;
            expect(await h.store.progress(h.renderId, d.stage, d.progress)).toBe('ok');
            const doc = (await h.store.get(h.renderId))!;
            expect(renderDocIssues(doc)).toEqual([]);
            expect(doc.progress).toBeGreaterThanOrEqual(last);
            expect(doc.progress).toBeLessThan(100);
            last = doc.progress;
          }
        },
      ),
      { numRuns: 60 },
    );
  });
});

describe('mapProgress', () => {
  it('is an integer in the band of its stage and non-decreasing in the producer percent', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<JobStage>('rendering', 'encoding'),
        candidate,
        candidate,
        (s, a, b) => {
          const lo = s === 'rendering' ? 1 : 85;
          const hi = s === 'rendering' ? 85 : 99;
          const x = mapProgress(s, a);
          expect(Number.isInteger(x)).toBe(true);
          expect(x).toBeGreaterThanOrEqual(lo);
          expect(x).toBeLessThanOrEqual(hi);
          if (Number.isFinite(a) && Number.isFinite(b) && a <= b) {
            expect(mapProgress(s, a)).toBeLessThanOrEqual(mapProgress(s, b));
          }
        },
      ),
      { numRuns: 300 },
    );
  });
});
