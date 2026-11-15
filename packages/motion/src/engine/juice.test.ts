import {
  ENERGY_INTERVAL_MS,
  EnergySchema,
  JuiceIdSchema,
  SLOW_JUICE,
  type JuiceId,
} from '@motionpop/schemas';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { beatInputArb, deepFreeze } from './beat-arbitraries';
import { scheduleBeats } from './beats';
import { FAST_JUICE_MS, QUIET_CAMERA_MAX, cameraTrack, planJuice } from './juice';

const RUNS = { numRuns: 500 };

const energyArb = fc.constantFrom(...EnergySchema.options);
const SLOW = [...SLOW_JUICE];
const FAST = JuiceIdSchema.options.filter((j) => !SLOW_JUICE.includes(j));
const juiceListArb: fc.Arbitrary<JuiceId[]> = fc.oneof(
  fc.uniqueArray(fc.constantFrom(...JuiceIdSchema.options), { maxLength: 7 }),
  fc.uniqueArray(fc.constantFrom(...SLOW), { minLength: 1 }), // only slow
  fc.uniqueArray(fc.constantFrom(...FAST), { minLength: 1 }), // only fast
  fc.constant([] as JuiceId[]),
);
/** The stage passes ['camera-push'] when nothing else is available. */
const effective = (list: JuiceId[]): JuiceId[] => (list.length > 0 ? list : ['camera-push']);

const scenarioArb = fc.record({
  input: beatInputArb,
  energy: energyArb,
  juice: juiceListArb,
  seed: fc.integer({ min: 0, max: 1_000_000 }),
  pauses: fc.array(
    fc
      .tuple(fc.integer({ min: 0, max: 12000 }), fc.integer({ min: 300, max: 1500 }))
      .map(([startMs, len]) => ({ startMs, endMs: startMs + len })),
    { maxLength: 8 },
  ),
});

type Scenario = typeof scenarioArb extends fc.Arbitrary<infer T> ? T : never;
const run = (s: Scenario) => {
  const plan = scheduleBeats(s.input);
  const juice = planJuice(plan, {
    energy: s.energy,
    juice: effective(s.juice),
    seed: s.seed,
    pauses: s.pauses,
  });
  return { plan, juice };
};

describe('planJuice properties', () => {
  it('meets the beat budget: maxGapMs ≤ interval + 1 for every energy', () => {
    fc.assert(
      fc.property(scenarioArb, (s) => {
        const { plan, juice } = run(s);
        if (plan.exitStartMs > 0) {
          expect(juice.budgetOk).toBe(true);
          expect(juice.maxGapMs).toBeLessThanOrEqual(ENERGY_INTERVAL_MS[s.energy] + 1);
        }
      }),
      RUNS,
    );
  });

  it('keeps every beat inside [0, exitStart], clear of cue entrances, and fast juice clear of read windows', () => {
    fc.assert(
      fc.property(scenarioArb, (s) => {
        const { plan, juice } = run(s);
        for (const b of juice.beats) {
          expect(b.atMs).toBeGreaterThanOrEqual(0);
          expect(b.atMs + b.durMs).toBeLessThanOrEqual(plan.exitStartMs);
          expect(b.durMs).toBeGreaterThan(0);
          // Code guarantee: beats are placed only in gaps between cue entrances [start, land].
          for (const c of plan.cues)
            expect(b.atMs + b.durMs <= c.startMs || b.atMs >= c.landMs).toBe(true);
          if (!b.slow) {
            expect(b.durMs).toBe(FAST_JUICE_MS);
            for (const q of plan.quiet)
              expect(b.atMs + b.durMs <= q.startMs || b.atMs >= q.endMs).toBe(true);
          }
        }
      }),
      RUNS,
    );
  });

  it('uses only slow ids for slow beats, only fast ids from the list for fast beats', () => {
    fc.assert(
      fc.property(scenarioArb, (s) => {
        const { juice } = run(s);
        const list = effective(s.juice);
        for (const b of juice.beats) {
          if (b.slow) {
            expect(SLOW_JUICE).toContain(b.id);
            expect(b.id === 'camera-push' || list.includes(b.id)).toBe(true);
          } else {
            expect(SLOW_JUICE).not.toContain(b.id);
            expect(list).toContain(b.id);
          }
        }
        // Fast beats exist only when the list has fast juice.
        if (!list.some((j) => !SLOW_JUICE.includes(j)))
          expect(juice.beats.every((b) => b.slow)).toBe(true);
      }),
      RUNS,
    );
  });

  it('is deterministic and does not mutate its input', () => {
    fc.assert(
      fc.property(scenarioArb, (s) => {
        const plan = deepFreeze(scheduleBeats(s.input));
        const opts = deepFreeze({
          energy: s.energy,
          juice: effective(s.juice),
          seed: s.seed,
          pauses: s.pauses,
        });
        expect(planJuice(plan, opts)).toEqual(planJuice(plan, opts));
      }),
      RUNS,
    );
  });
});

describe('cameraTrack properties', () => {
  const cameraArb = fc.record({
    scenario: scenarioArb,
    a: fc.double({ min: 1, max: 1.15, noNaN: true }),
    b: fc.double({ min: 1, max: 1.15, noNaN: true }),
    snap: fc.double({ min: 0, max: 0.15, noNaN: true }),
  });

  it('changes by at most QUIET_CAMERA_MAX across every read window, sampled every 5 ms', () => {
    fc.assert(
      fc.property(cameraArb, ({ scenario, a, b, snap }) => {
        const { plan, juice } = run(scenario);
        const track = cameraTrack(plan.quiet, juice.beats, {
          push: [a, b],
          snap,
          durationMs: scenario.input.durationMs,
        });
        for (const q of plan.quiet) {
          let lo = Infinity;
          let hi = -Infinity;
          for (let t = q.startMs; t <= q.endMs; t += 5) {
            const v = track(t);
            lo = Math.min(lo, v);
            hi = Math.max(hi, v);
          }
          const end = track(q.endMs);
          lo = Math.min(lo, end);
          hi = Math.max(hi, end);
          expect(hi - lo).toBeLessThanOrEqual(QUIET_CAMERA_MAX + 1e-9);
        }
      }),
      RUNS,
    );
  });

  it('stays within [min(push), max(push) + snap], starts at min(push), and is deterministic', () => {
    fc.assert(
      fc.property(cameraArb, ({ scenario, a, b, snap }) => {
        const { plan, juice } = run(scenario);
        const opts = { push: [a, b] as const, snap, durationMs: scenario.input.durationMs };
        const track = cameraTrack(plan.quiet, juice.beats, opts);
        const again = cameraTrack(plan.quiet, juice.beats, opts);
        expect(track(0)).toBe(Math.min(a, b));
        // Plain comparisons in the loop, one expect per run: the same checks, but ~20x fewer
        // expect calls, so the property stays well under the timeout on a loaded runner (it took
        // 6.1 s in the full forced suite on 2026-11-15, 0.8 s alone).
        const bad: string[] = [];
        for (let t = 0; t <= opts.durationMs; t += 25) {
          const v = track(t);
          if (v < Math.min(a, b) - 1e-9) bad.push(`t=${t}: ${v} below min`);
          if (v > Math.max(a, b) + snap + 1e-9) bad.push(`t=${t}: ${v} above max + snap`);
          if (v !== again(t)) bad.push(`t=${t}: not deterministic`);
        }
        expect(bad).toEqual([]);
      }),
      RUNS,
    );
  });
});
