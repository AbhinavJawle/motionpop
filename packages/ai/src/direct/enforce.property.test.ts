// Property tests for the director's enforcer (spec 07 task 27, the [kiro] part; R6.1, design
// "AI flow" 2 and "Checks", property 4). Plans of three kinds go in: random schema-valid plans
// (slot indices inside and outside the context), random garbage (anything, wrong types, partial
// plans with broken entries) and the code-only `fallbackPlan(ctx)`. Every property runs over a mix
// of the three and counts, per run, the cases that keep it from passing vacuously. The counts are
// asserted after the run. Each limit sits about five standard deviations below the mean measured
// over 8 runs of 300 (2026-11-15), so no property depends on rare random coverage.
// Set DEBUG_COVERAGE=1 (with --silent=false) to print the counts.
import {
  DirectorPlanSchema,
  EnergySchema,
  type DirectorPlan,
  type Energy,
} from '@motionpop/schemas';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { enforcePlan, salvagePlan, type PlanContext, type PlanScene } from './enforce';
import { fallbackPlan } from './fallback';

const RUNS = 300;
const ENERGIES = EnergySchema.options;
const level = (e: Energy) => ENERGIES.indexOf(e);

const SCENE_IDS = [
  'stat-punch',
  'hook-statement',
  'photo-evidence',
  'versus',
  'chart-story',
  'map-journey',
];
const VARIANT_IDS = [
  'stack',
  'hero',
  'side',
  'center',
  'left',
  'punch',
  'single',
  'pinned',
  'pair',
];
const MOTIF_IDS = ['marker-circle', 'torn-strip', 'tape', 'stamp', 'highlighter', 'arrow', 'badge'];
/**
 * Ids that are in no scene set. Object prototype keys are here on purpose: a bare `scenes[id]`
 * lookup finds them on any object made with `{}` or `Object.fromEntries`.
 */
const STRANGE_IDS = [
  'mystery',
  'constructor',
  'toString',
  '__proto__',
  'hasOwnProperty',
  'valueOf',
];

/** A scene of the context, by own key only (the test's reading of "exists in the scene set"). */
const sceneIn = (ctx: PlanContext, id: string): PlanScene | undefined =>
  Object.hasOwn(ctx.scenes, id) ? ctx.scenes[id] : undefined;
const knownCandidates = (ctx: PlanContext, i: number): string[] =>
  (ctx.slots[i]?.candidates ?? []).filter((c) => sceneIn(ctx, c) !== undefined);

function deepFreeze<T>(v: T): T {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const k of Object.keys(v)) deepFreeze((v as Record<string, unknown>)[k]);
  }
  return v;
}

// --- contexts ------------------------------------------------------------------------------

const sceneDef: fc.Arbitrary<PlanScene> = fc
  .uniqueArray(fc.constantFrom(...VARIANT_IDS), { minLength: 3, maxLength: 5 })
  .chain((variants) =>
    fc.record({
      variants: fc.constant(variants),
      // Usually one of its variants; sometimes not, so the peak falls back to the first.
      strongest: fc.oneof(
        { weight: 3, arbitrary: fc.constantFrom(...variants) },
        {
          weight: 1,
          arbitrary: fc.constantFrom(
            'missing',
            ...VARIANT_IDS.filter((v) => !variants.includes(v)),
          ),
        },
      ),
      imageRole: fc.boolean(),
    }),
  );

/** 2–5 scenes; the first has an image role and the second hasn't, the others are random. */
const sceneSet: fc.Arbitrary<Record<string, PlanScene>> = fc
  .uniqueArray(fc.constantFrom(...SCENE_IDS), { minLength: 2, maxLength: 5 })
  .chain((ids) =>
    fc
      .array(sceneDef, { minLength: ids.length, maxLength: ids.length })
      .map((defs) =>
        Object.fromEntries(
          defs.map((d, k) => [
            ids[k] as string,
            { ...d, imageRole: k === 0 || (k !== 1 && d.imageRole) },
          ]),
        ),
      ),
  );

const contextArb: fc.Arbitrary<PlanContext> = fc
  .tuple(sceneSet, fc.integer({ min: 1, max: 30 }))
  .chain(([scenes, n]) => {
    const known = Object.keys(scenes);
    const candidate = fc.oneof(
      { weight: 8, arbitrary: fc.constantFrom(...known) },
      {
        weight: 1,
        arbitrary: fc.constantFrom(
          ...STRANGE_IDS,
          ...SCENE_IDS.filter((id) => !known.includes(id)),
        ),
      },
      { weight: 1, arbitrary: fc.string({ minLength: 1, maxLength: 12 }) },
    );
    const score = fc.oneof(
      fc.double({ min: 0, max: 1, noNaN: true }),
      fc.constantFrom(0, 0.5, 1), // ties
    );
    return fc.record({
      slots: fc.array(
        fc.record({ candidates: fc.array(candidate, { minLength: 1, maxLength: 4 }), score }),
        { minLength: n, maxLength: n },
      ),
      scenes: fc.constant(scenes),
      motifs: fc.uniqueArray(fc.constantFrom(...MOTIF_IDS), { maxLength: 6 }),
      imagesMax: fc.integer({ min: 0, max: 5 }),
      energy: fc.constantFrom(...ENERGIES),
      seed: fc.oneof(fc.integer(), fc.maxSafeInteger()),
    });
  });

// --- plans ---------------------------------------------------------------------------------

type SceneEntry = DirectorPlan['scenes'][number];

/** A slot index: mostly inside the context, sometimes just past its end or anywhere. */
const slotIndex = (n: number) =>
  fc.oneof(
    { weight: 6, arbitrary: fc.integer({ min: 0, max: n - 1 }) },
    { weight: 1, arbitrary: fc.integer({ min: n, max: n + 5 }) },
    { weight: 1, arbitrary: fc.nat() },
  );

/**
 * Scene picks shaped like a model's: one per slot from a favourite scene order, often the same
 * variant index, so neighbours with the same scene often ask for the same variant.
 */
function alignedScenes(ctx: PlanContext): fc.Arbitrary<SceneEntry[]> {
  const n = ctx.slots.length;
  return fc
    .record({
      order: fc.shuffledSubarray(SCENE_IDS, { minLength: SCENE_IDS.length }),
      fav: fc.nat({ max: 4 }),
      modes: fc.array(
        fc.oneof(
          { weight: 5, arbitrary: fc.constant('fav') },
          { weight: 1, arbitrary: fc.constantFrom('random', 'none', 'bad', 'skip') },
        ),
        { minLength: n, maxLength: n },
      ),
      picks: fc.array(fc.nat({ max: 4 }), { minLength: n, maxLength: n }),
    })
    .map(({ order, fav, modes, picks }) =>
      ctx.slots.flatMap((s, i): SceneEntry[] => {
        const mode = modes[i];
        if (mode === 'skip') return [];
        const sceneId =
          order.find((id) => s.candidates.includes(id)) ?? (s.candidates[0] as string);
        const variants = sceneIn(ctx, sceneId)?.variants ?? VARIANT_IDS;
        const variant =
          mode === 'fav'
            ? variants[fav % variants.length]
            : mode === 'random'
              ? variants[(picks[i] ?? 0) % variants.length]
              : mode === 'bad'
                ? 'missing'
                : undefined;
        return [variant === undefined ? { slot: i, sceneId } : { slot: i, sceneId, variant }];
      }),
    );
}

/** A random schema-valid plan for `ctx`: ids known and unknown, indices inside and outside. */
function validPlan(ctx: PlanContext): fc.Arbitrary<DirectorPlan> {
  const n = ctx.slots.length;
  const slot = slotIndex(n);
  const randomScenes = fc.array(
    fc.record(
      {
        slot,
        sceneId: fc.constantFrom(...SCENE_IDS, ...STRANGE_IDS),
        variant: fc.constantFrom(...VARIANT_IDS, 'missing'),
      },
      { requiredKeys: ['slot', 'sceneId'] },
    ),
    { maxLength: 20 },
  );
  const scenes = fc.oneof(
    { weight: 3, arbitrary: alignedScenes(ctx) },
    {
      weight: 2,
      arbitrary: fc.tuple(alignedScenes(ctx), randomScenes).map(([a, r]) => [...a, ...r]),
    },
    {
      weight: 1,
      arbitrary: fc
        .tuple(alignedScenes(ctx), randomScenes)
        .chain(([a, r]) => fc.shuffledSubarray([...a, ...r], { minLength: a.length + r.length })),
    },
    { weight: 1, arbitrary: randomScenes },
  );
  const arc = fc.oneof(
    {
      // An energy for every slot, so steps between neighbours are often more than one.
      weight: 3,
      arbitrary: fc
        .array(fc.constantFrom(...ENERGIES), { minLength: n, maxLength: n })
        .map((es) => es.map((energy, i) => ({ slot: i, energy }))),
    },
    {
      weight: 1,
      arbitrary: fc.array(fc.record({ slot, energy: fc.constantFrom(...ENERGIES) }), {
        maxLength: 60,
      }),
    },
  );
  // Slots that can show an image under some known candidate, so the cap has something to cut.
  const imageable = ctx.slots.flatMap((_, i) =>
    knownCandidates(ctx, i).some((c) => sceneIn(ctx, c)?.imageRole) ? [i] : [],
  );
  const image = imageable.length ? fc.oneof(slot, fc.constantFrom(...imageable)) : slot;
  const images = fc.oneof(
    { weight: 1, arbitrary: fc.array(image, { maxLength: 20 }) },
    {
      // A greedy plan: every slot that might take an image, in any order, plus a few others.
      weight: 2,
      arbitrary: fc
        .tuple(fc.shuffledSubarray(imageable, { minLength: imageable.length }), fc.array(slot))
        .map(([all, more]) => [...all, ...more].slice(0, 20)),
    },
  );
  return fc.record(
    {
      arc,
      peak: slot,
      scenes,
      motifs: fc.array(
        fc.record({
          motif: fc.constantFrom(...ctx.motifs, ...MOTIF_IDS, 'neon-glow'),
          slots: fc.array(slot, { maxLength: 60 }),
        }),
        { maxLength: 6 },
      ),
      images,
      reasons: fc.array(fc.string({ maxLength: 160 }), { maxLength: 60 }),
    },
    { requiredKeys: ['arc', 'peak', 'scenes', 'motifs', 'images'] },
  );
}

const anything = fc.anything({
  maxDepth: 3,
  withBigInt: true,
  withBoxedValues: true,
  withDate: true,
  withMap: true,
  withNullPrototype: true,
  withSet: true,
  withSparseArray: true,
});
const S = DirectorPlanSchema.shape;
const JUNK: unknown[] = [
  { slot: -1, energy: 'calm' },
  { slot: 1.5, energy: 'hype' },
  { slot: 0, energy: 'loud' },
  { slot: 0, sceneId: '' },
  { slot: '1', sceneId: 'stat-punch' },
  { motif: '', slots: [0] },
  { motif: 'tape', slots: [-2] },
  -3,
  0.5,
  '2',
  null,
  [0],
];
/** An entry that doesn't parse as an element of `schema`, so salvage has to skip it. */
const junkFor = (schema: z.ZodType) =>
  fc.oneof(anything, fc.constantFrom(...JUNK)).filter((x) => !schema.safeParse(x).success);
const wrongList: fc.Arbitrary<unknown> = fc.oneof(
  fc.string(),
  fc.integer(),
  fc.constant(null),
  fc.dictionary(fc.string({ maxLength: 4 }), anything, { maxKeys: 3 }),
);
const wrongPeak: fc.Arbitrary<unknown> = fc.oneof(
  fc.string(),
  fc.double().filter((x) => !(Number.isInteger(x) && x >= 0)),
  fc.constantFrom(-1, 1.5, null, Number.NaN, Number.POSITIVE_INFINITY, '0', [0], true),
);
const LIST_KEYS = ['arc', 'scenes', 'motifs', 'images'] as const;
type ListKey = (typeof LIST_KEYS)[number];
const KEYS = ['peak', ...LIST_KEYS] as const;

/** A valid plan with at least one required field deleted, of a wrong type, or holding junk. */
function partialPlan(ctx: PlanContext): fc.Arbitrary<Record<string, unknown>> {
  const junk = fc.record({
    arc: fc.array(junkFor(S.arc.element), { minLength: 1, maxLength: 3 }),
    scenes: fc.array(junkFor(S.scenes.element), { minLength: 1, maxLength: 3 }),
    motifs: fc.array(junkFor(S.motifs.element), { minLength: 1, maxLength: 3 }),
    images: fc.array(junkFor(S.images.element), { minLength: 1, maxLength: 3 }),
  });
  return fc
    .record({
      plan: validPlan(ctx),
      broken: fc.subarray([...KEYS], { minLength: 1 }),
      how: fc.array(fc.constantFrom('delete', 'wrong', 'junk', 'junk'), {
        minLength: KEYS.length,
        maxLength: KEYS.length,
      }),
      wrong: fc.record({ peak: wrongPeak, list: wrongList }),
      junk,
    })
    .map(({ plan, broken, how, wrong, junk: bad }) => {
      const out: Record<string, unknown> = { ...plan };
      broken.forEach((key, k) => {
        const h = how[k];
        if (h === 'delete') delete out[key];
        else if (key === 'peak') out[key] = wrong.peak;
        else if (h === 'wrong') out[key] = wrong.list;
        else {
          const [first, ...rest] = bad[key as ListKey];
          out[key] = [first, ...(plan[key as ListKey] as unknown[]), ...rest];
        }
      });
      return out;
    });
}

function garbagePlan(ctx: PlanContext): fc.Arbitrary<unknown> {
  return fc.oneof(
    { weight: 1, arbitrary: anything },
    {
      weight: 1,
      arbitrary: fc.record(
        {
          arc: wrongList,
          peak: wrongPeak,
          scenes: wrongList,
          motifs: wrongList,
          images: wrongList,
          reasons: fc.oneof(fc.integer(), fc.array(fc.integer(), { minLength: 1, maxLength: 3 })),
        },
        { requiredKeys: [] },
      ),
    },
    // Half the garbage is a near-miss plan, so salvage has real entries to keep.
    { weight: 2, arbitrary: partialPlan(ctx) },
  );
}

type Kind = 'valid' | 'garbage' | 'fallback';
interface Case {
  kind: Kind;
  ctx: PlanContext;
  raw: unknown;
}
const caseArb: fc.Arbitrary<Case> = contextArb.chain((ctx) =>
  fc.oneof(
    { weight: 2, arbitrary: validPlan(ctx).map((raw): Case => ({ kind: 'valid', ctx, raw })) },
    {
      weight: 1,
      arbitrary: garbagePlan(ctx).map((raw): Case => ({ kind: 'garbage', ctx, raw })),
    },
    { weight: 1, arbitrary: fc.constant<Case>({ kind: 'fallback', ctx, raw: fallbackPlan(ctx) }) },
  ),
);

// --- coverage ------------------------------------------------------------------------------

/**
 * Counts, per run, the flags a check raised; asserts each flag's share after the run.
 * Changed in the Kiro IDE review (2026-11-15): the floors are about 0.6 of what Kiro first set.
 * Those sat about 5 standard deviations under means estimated from 8 runs, and one floor
 * flaked in the full suite ("plan scene dropped" 111 of 300 against 115). A floor only has to
 * prove the case occurs often, and at 0.6 of the old floor it sits far under the mean.
 */
function coverage(name: string) {
  const counts: Record<string, number> = {};
  return {
    counts,
    run(check: (flag: (f: string) => void) => void) {
      const seen = new Set<string>();
      check((f) => seen.add(f));
      for (const f of seen) counts[f] = (counts[f] ?? 0) + 1;
    },
    /** `flag` was raised in at least `min` runs. */
    atLeast(flag: string, min: number) {
      expect(
        counts[flag] ?? 0,
        `property ${name}: "${flag}" in ${counts[flag] ?? 0} of ${RUNS} runs`,
      ).toBeGreaterThanOrEqual(min);
    },
    /** Prints the counts with DEBUG_COVERAGE=1; checks every kind got a fair share. */
    done(withKinds = true) {
      if (process.env['DEBUG_COVERAGE']) console.log(`property ${name}`, JSON.stringify(counts));
      if (!withKinds) return;
      // Valid plans are expected in 150 of 300 runs (sd ≈ 9), garbage and fallback in 75 (sd ≈ 7.5).
      this.atLeast('kind valid', 63);
      this.atLeast('kind garbage', 21);
      this.atLeast('kind fallback', 21);
    },
  };
}

/** What the enforcer reads from a raw plan: the whole plan, or every entry that parses. */
const asked = (raw: unknown) => salvagePlan(raw);

/** The highest-scoring slot, earliest on ties. */
function highestScore(ctx: PlanContext): number {
  let best = 0;
  ctx.slots.forEach((s, i) => {
    if (s.score > (ctx.slots[best]?.score ?? Number.NEGATIVE_INFINITY)) best = i;
  });
  return best;
}

// --- properties ----------------------------------------------------------------------------

describe('enforcePlan properties (spec 07 task 27, design "Checks" property 4)', () => {
  it('1. one slot per context slot; scenes are known candidates, variants the scene’s own', () => {
    const cov = coverage('1');
    fc.assert(
      fc.property(caseArb, ({ kind, ctx, raw }) =>
        cov.run((flag) => {
          flag(`kind ${kind}`);
          if (kind === 'valid') expect(DirectorPlanSchema.safeParse(raw).success).toBe(true);
          const out = enforcePlan(raw, ctx);
          const plan = asked(raw);
          expect(out.slots).toHaveLength(ctx.slots.length);
          out.slots.forEach((s, i) => {
            const known = knownCandidates(ctx, i);
            if (!known.length) {
              // Interpretation: a slot whose candidates are all unknown has no scene at all.
              flag('slot without a known candidate');
              expect(s).toMatchObject({ sceneId: '', variant: '' });
              return;
            }
            expect(known).toContain(s.sceneId);
            expect(sceneIn(ctx, s.sceneId)?.variants).toContain(s.variant);
            // The plan's first allowed pick wins; without one, the detected (first known) scene.
            const pick = plan.scenes.find((e) => e.slot === i && known.includes(e.sceneId));
            expect(s.sceneId).toBe(pick?.sceneId ?? known[0]);
            if (pick) flag('plan scene kept');
            if (plan.scenes.some((e) => e.slot === i && !known.includes(e.sceneId)))
              flag('plan scene dropped');
            if (ctx.slots[i]?.candidates.some((c) => STRANGE_IDS.includes(c)))
              flag('prototype-like candidate');
          });
        }),
      ),
      { numRuns: RUNS },
    );
    cov.done();
    cov.atLeast('plan scene kept', 114);
    cov.atLeast('plan scene dropped', 69);
    cov.atLeast('slot without a known candidate', 69);
    cov.atLeast('prototype-like candidate', 102);
  });

  it('2. no neighbours share a scene and a variant; a plan variant changes only to break a repeat', () => {
    const cov = coverage('2');
    fc.assert(
      fc.property(caseArb, ({ kind, ctx, raw }) =>
        cov.run((flag) => {
          flag(`kind ${kind}`);
          const out = enforcePlan(raw, ctx);
          const plan = asked(raw);
          const n = out.slots.length;
          for (let i = 1; i < n; i++) {
            const a = out.slots[i - 1];
            const b = out.slots[i];
            if (!a || !b || a.sceneId === '' || a.sceneId !== b.sceneId) continue;
            flag('neighbours share a scene');
            expect(b.variant).not.toBe(a.variant);
          }
          out.slots.forEach((s, i) => {
            const scene = sceneIn(ctx, s.sceneId);
            if (i === out.peak || !scene) return;
            const entry = plan.scenes.find((e) => e.slot === i && e.sceneId === s.sceneId);
            const wanted =
              entry?.variant && scene.variants.includes(entry.variant) ? entry.variant : undefined;
            if (wanted === undefined) return;
            if (s.variant === wanted) {
              flag(`plan variant kept (${kind})`);
              return;
            }
            flag(`repeat broken (${kind})`);
            const neighbours = [out.slots[i - 1], out.slots[i + 1]];
            expect(
              neighbours.some((x) => x?.sceneId === s.sceneId && x.variant === wanted),
              `slot ${i} lost its variant "${wanted}" without a repeat`,
            ).toBe(true);
          });
        }),
      ),
      { numRuns: RUNS },
    );
    cov.done();
    cov.atLeast('neighbours share a scene', 120);
    cov.atLeast('plan variant kept (valid)', 48);
    cov.atLeast('repeat broken (valid)', 33);
    cov.atLeast('plan variant kept (garbage)', 4); // mean 22: salvaged near-miss plans
  });

  it('3. images: no repeats, at most the cap, in range, only on scenes with an image role', () => {
    const cov = coverage('3');
    fc.assert(
      fc.property(caseArb, ({ kind, ctx, raw }) =>
        cov.run((flag) => {
          flag(`kind ${kind}`);
          const out = enforcePlan(raw, ctx);
          const plan = asked(raw);
          const n = ctx.slots.length;
          expect(new Set(out.images).size).toBe(out.images.length);
          expect(out.images.length).toBeLessThanOrEqual(ctx.imagesMax);
          for (const i of out.images) {
            expect(Number.isInteger(i) && i >= 0 && i < n).toBe(true);
            expect(sceneIn(ctx, out.slots[i]?.sceneId ?? '')?.imageRole).toBe(true);
          }
          // Trimmed, not reordered: the plan's allowed images, best first, up to the cap.
          const allowed = [
            ...new Set(
              plan.images.filter(
                (i) => i < n && sceneIn(ctx, out.slots[i]?.sceneId ?? '')?.imageRole === true,
              ),
            ),
          ];
          expect(out.images).toEqual(allowed.slice(0, ctx.imagesMax));
          if (allowed.length > ctx.imagesMax) flag(`dropped by the cap (${kind})`);
          if (plan.images.some((i) => i >= n)) flag('image outside the context');
          if (plan.images.some((i) => i < n && !allowed.includes(i)))
            flag('image on a scene without an image role');
          if (new Set(plan.images).size < plan.images.length) flag('repeated image');
          if (out.images.length) flag(`images kept (${kind})`);
        }),
      ),
      { numRuns: RUNS },
    );
    cov.done();
    cov.atLeast('dropped by the cap (valid)', 24);
    cov.atLeast('image outside the context', 27);
    cov.atLeast('image on a scene without an image role', 51);
    cov.atLeast('repeated image', 36);
    cov.atLeast('images kept (valid)', 36);
    cov.atLeast('images kept (fallback)', 12);
  });

  it('4. the peak is a slot and gets its scene’s strongest variant (or the first)', () => {
    const cov = coverage('4');
    fc.assert(
      fc.property(caseArb, ({ kind, ctx, raw }) =>
        cov.run((flag) => {
          flag(`kind ${kind}`);
          const out = enforcePlan(raw, ctx);
          const plan = asked(raw);
          const n = ctx.slots.length;
          expect(Number.isInteger(out.peak) && out.peak >= 0 && out.peak < n).toBe(true);
          // The plan's peak when it names a slot, else the highest score.
          const inside = plan.peak >= 0 && plan.peak < n;
          expect(out.peak).toBe(inside ? plan.peak : highestScore(ctx));
          flag(inside ? 'plan peak' : 'score peak');
          const s = out.slots[out.peak];
          const scene = sceneIn(ctx, s?.sceneId ?? '');
          if (!scene) {
            // Interpretation: a peak on a slot without a scene has no variant to strengthen.
            flag('peak without a scene');
            return;
          }
          const strong = scene.variants.includes(scene.strongest);
          expect(s?.variant).toBe(strong ? scene.strongest : scene.variants[0]);
          flag(strong ? 'strongest at the peak' : 'first variant at the peak');
          const entry = plan.scenes.find((e) => e.slot === out.peak && e.sceneId === s?.sceneId);
          if (entry?.variant && entry.variant !== s?.variant) flag('plan peak variant overridden');
        }),
      ),
      { numRuns: RUNS },
    );
    cov.done();
    cov.atLeast('plan peak', 93);
    cov.atLeast('score peak', 33);
    cov.atLeast('strongest at the peak', 105);
    cov.atLeast('first variant at the peak', 15);
    cov.atLeast('plan peak variant overridden', 33);
  });

  it('5. energy: neighbours differ by at most one step, except next to the peak', () => {
    const cov = coverage('5');
    fc.assert(
      fc.property(caseArb, ({ kind, ctx, raw }) =>
        cov.run((flag) => {
          flag(`kind ${kind}`);
          const out = enforcePlan(raw, ctx);
          const plan = asked(raw);
          const asks = ctx.slots.map(
            (_, i) => plan.arc.find((a) => a.slot === i)?.energy ?? ctx.energy,
          );
          const e = out.slots.map((s) => {
            expect(ENERGIES).toContain(s.energy);
            return level(s.energy);
          });
          for (let i = 1; i < e.length; i++) {
            const step = Math.abs((e[i] as number) - (e[i - 1] as number));
            const askedStep = Math.abs(level(asks[i] as Energy) - level(asks[i - 1] as Energy));
            if (i === out.peak || i - 1 === out.peak) {
              if (step > 1) flag('jump next to the peak kept');
              continue;
            }
            expect(step).toBeLessThanOrEqual(1);
            if (askedStep > 1) flag('step clamped');
          }
          // The exception is for the peak: its own energy is the plan's.
          expect(out.slots[out.peak]?.energy).toBe(asks[out.peak]);
        }),
      ),
      { numRuns: RUNS },
    );
    cov.done();
    cov.atLeast('step clamped', 48);
    cov.atLeast('jump next to the peak kept', 18);
  });

  it('6. motifs: only the look’s, once each, on sorted unique slots inside the context', () => {
    const cov = coverage('6');
    fc.assert(
      fc.property(caseArb, ({ kind, ctx, raw }) =>
        cov.run((flag) => {
          flag(`kind ${kind}`);
          const out = enforcePlan(raw, ctx);
          const plan = asked(raw);
          const n = ctx.slots.length;
          const ids = out.motifs.map((m) => m.motif);
          expect(new Set(ids).size).toBe(ids.length);
          for (const m of out.motifs) {
            expect(ctx.motifs).toContain(m.motif);
            m.slots.forEach((i, k) => {
              expect(Number.isInteger(i) && i >= 0 && i < n).toBe(true);
              if (k > 0) expect(i).toBeGreaterThan(m.slots[k - 1] as number);
            });
          }
          // Nothing allowed is lost: every look motif the plan places on a slot comes out.
          const placed = new Set(
            plan.motifs
              .filter((m) => ctx.motifs.includes(m.motif) && m.slots.some((i) => i < n))
              .map((m) => m.motif),
          );
          expect(new Set(ids)).toEqual(placed);
          if (plan.motifs.some((m) => !ctx.motifs.includes(m.motif))) flag('foreign motif dropped');
          if (new Set(plan.motifs.map((m) => m.motif)).size < plan.motifs.length)
            flag('repeated motif');
          if (plan.motifs.some((m) => m.slots.some((i) => i >= n))) flag('motif slot outside');
          if (plan.motifs.some((m) => new Set(m.slots).size < m.slots.length))
            flag('motif slot repeated');
          if (out.motifs.length) flag(`motif kept (${kind})`);
        }),
      ),
      { numRuns: RUNS },
    );
    cov.done();
    cov.atLeast('foreign motif dropped', 42);
    cov.atLeast('repeated motif', 18);
    cov.atLeast('motif slot outside', 54);
    cov.atLeast('motif slot repeated', 39);
    cov.atLeast('motif kept (valid)', 24);
    cov.atLeast('motif kept (fallback)', 15);
  });

  it('7. deterministic, and neither the plan nor the context is mutated', () => {
    const cov = coverage('7');
    fc.assert(
      fc.property(caseArb, ({ kind, ctx, raw }) =>
        cov.run((flag) => {
          flag(`kind ${kind}`);
          const rawCopy: unknown = structuredClone(raw);
          const ctxCopy = structuredClone(ctx);
          deepFreeze(raw);
          deepFreeze(ctx);
          const first = enforcePlan(raw, ctx);
          expect(enforcePlan(raw, ctx)).toEqual(first);
          // An equal copy gives an equal plan, so nothing hangs on object identity.
          expect(enforcePlan(structuredClone(rawCopy), structuredClone(ctxCopy))).toEqual(first);
          expect(fallbackPlan(ctx)).toEqual(fallbackPlan(ctxCopy));
          expect(raw).toEqual(rawCopy);
          expect(ctx).toEqual(ctxCopy);
          if (kind === 'garbage' && !DirectorPlanSchema.safeParse(raw).success)
            flag('garbage that does not parse');
          if (kind === 'garbage' && asked(raw).scenes.some((e) => e.slot < ctx.slots.length))
            flag('garbage with salvaged scenes');
        }),
      ),
      { numRuns: RUNS },
    );
    cov.done();
    // Nearly all garbage must really fail the schema, or the salvage path isn't being tested.
    expect(cov.counts['garbage that does not parse'] ?? 0).toBeGreaterThanOrEqual(
      Math.floor(0.95 * (cov.counts['kind garbage'] ?? 0)),
    );
    cov.atLeast('garbage with salvaged scenes', 6); // mean 27
  });
});

describe('fallbackPlan properties', () => {
  it('8. parses with the plan schema as it is, and the enforcer keeps its choices', () => {
    const cov = coverage('8');
    fc.assert(
      fc.property(contextArb, (ctx) =>
        cov.run((flag) => {
          const plan = fallbackPlan(ctx);
          const parsed = DirectorPlanSchema.safeParse(plan);
          expect(parsed.success).toBe(true);
          expect(parsed.data).toEqual(plan);
          expect(salvagePlan(plan)).toEqual(plan);
          // Needs no salvage downstream either: peak, energies, images and motifs stay.
          const out = enforcePlan(plan, ctx);
          expect(out.peak).toBe(plan.peak);
          expect(out.slots.map((s) => s.energy)).toEqual(plan.arc.map((a) => a.energy));
          expect(out.images).toEqual(plan.images);
          expect(out.motifs).toEqual(plan.motifs);
          if (plan.images.length) flag('fallback images');
          if (plan.images.length === ctx.imagesMax && ctx.imagesMax > 0)
            flag('fallback cap reached');
          if (plan.motifs.length) flag('fallback motif');
          if (plan.peak > 0) flag('peak after the first slot');
        }),
      ),
      { numRuns: RUNS },
    );
    cov.done(false);
    cov.atLeast('fallback images', 105);
    cov.atLeast('fallback cap reached', 75);
    cov.atLeast('fallback motif', 129);
    cov.atLeast('peak after the first slot', 102);
  });
});
