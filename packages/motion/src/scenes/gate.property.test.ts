// @vitest-environment happy-dom
// Property tests for the gate reports and safe defaults (spec 07 task 17; R1.4, R5.3, R9.2).
// happy-dom never measures text, so overflow and truncation reports are not exercised here;
// the reports that are (schema, ids, anchors, dropped and squeezed cues, build errors) are.
import { GateReportSchema, gateReportText, type Look, type StylePack } from '@motionpop/schemas';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Format } from '../contract';
import { editorialExplainer, fieldNotes } from '../styles';
import { gateSlot, repairable, safeScore, type GateOptions } from './gate';
import { hookStatement } from './hook-statement';
import * as hookSamples from './hook-statement/samples';
import { statPunch } from './stat-punch';
import * as statSamples from './stat-punch/samples';
import type { Scene } from './define';

type AnyScene = Scene<unknown>;
const FORMATS_: Format[] = ['16:9', '9:16', '1:1'];
const CASES = [
  {
    scene: statPunch as unknown as AnyScene,
    arbitrary: statSamples.arbitrary as fc.Arbitrary<unknown>,
  },
  {
    scene: hookStatement as unknown as AnyScene,
    arbitrary: hookSamples.arbitrary as fc.Arbitrary<unknown>,
  },
];

function deepFreeze<T>(v: T): T {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const k of Object.keys(v)) deepFreeze((v as Record<string, unknown>)[k]);
  }
  return v;
}

// --- generators ---------------------------------------------------------------------------

const wordTimes = fc
  .array(fc.tuple(fc.integer({ min: 0, max: 800 }), fc.integer({ min: 20, max: 600 })), {
    maxLength: 14,
  })
  .map((rows) => {
    let t = 0;
    return rows.map(([gap, len]) => {
      const startMs = t + gap;
      t = startMs + len;
      return { startMs, endMs: t };
    });
  });

interface Setup {
  scene: AnyScene;
  base: fc.Arbitrary<unknown>;
  o: GateOptions;
}

const setup = fc
  .record({
    c: fc.constantFrom(...CASES),
    format: fc.constantFrom(...FORMATS_),
    plain: fc.boolean(),
    dur: fc.nat(),
    exact: fc.constantFrom('min', 'ideal', 'max', 'free'),
    words: fc.option(wordTimes, { nil: undefined }),
    stress: fc.option(fc.array(fc.integer({ min: 0, max: 100 }), { maxLength: 14 }), {
      nil: undefined,
    }),
    seed: fc.integer({ min: 0, max: 1000 }),
  })
  .map(({ c, format, plain, dur, exact, words, stress, seed }): Setup => {
    const d = c.scene.durationMs;
    // From below min to above max, plus the exact boundaries.
    const durationMs =
      exact === 'free'
        ? Math.max(300, d.min - 1500 + (dur % (d.max - d.min + 4500)))
        : d[exact as 'min'];
    const style: StylePack | Look = structuredClone(plain ? editorialExplainer : fieldNotes);
    return {
      scene: c.scene,
      base: c.arbitrary,
      o: {
        format,
        style,
        ...(plain ? {} : { look: structuredClone(fieldNotes) }),
        durationMs,
        ...(words ? { words } : {}),
        ...(stress ? { stress } : {}),
        seed,
      },
    };
  });

/** A valid score with one thing broken. */
function mutate(scene: AnyScene, valid: unknown, kind: number, pick: number): unknown {
  const s = structuredClone(valid) as Record<string, unknown>;
  const content = (s['content'] ?? {}) as Record<string, unknown>;
  const ck = Object.keys(content);
  const key = ck[pick % Math.max(1, ck.length)] ?? 'x';
  const tk = Object.keys(s);
  switch (kind % 9) {
    case 0:
      delete s[tk[pick % tk.length] as string];
      return s;
    case 1:
      delete content[key];
      return s;
    case 2:
      content[key] = [null, 7, [], {}, true, 'text'][pick % 6];
      return s;
    case 3:
      content[key] = 'x'.repeat(300 + pick);
      return s;
    case 4:
      s['variant'] = `nope-${pick}`;
      return s;
    case 5:
      s['beats'] = [{ cue: `nope-${pick}`, word: 0 }];
      return s;
    case 6:
      s['beats'] = [{ cue: scene.cues[0]?.id, word: 5 + pick }];
      return s;
    case 7:
      s['beats'] = 'later';
      return s;
    default:
      s['images'] = [{ role: 'nope', subject: 'x' }];
      return s;
  }
}

/** Valid, mutated, and plain garbage scores for one setup. */
const scoreFor = (su: Setup): fc.Arbitrary<unknown> =>
  fc.oneof(
    { arbitrary: su.base, weight: 3 },
    {
      arbitrary: fc
        .tuple(su.base, fc.nat(), fc.nat(200))
        .map(([v, k, p]) => mutate(su.scene, v, k, p)),
      weight: 4,
    },
    { arbitrary: fc.anything(), weight: 2 },
  );

const input = setup.chain((su) => scoreFor(su).map((score) => ({ su, score })));

const RUNS = 100;

// --- 1 and 2: reports ---------------------------------------------------------------------

describe('gate reports (properties)', () => {
  it('every report parses, names an actor and a rule, has a short hint, one line each', () => {
    let reported = 0;
    const seen = new Set<string>();
    fc.assert(
      fc.property(input, ({ su, score }) => {
        const reports = gateSlot(su.scene, score, su.o);
        reported += reports.length;
        for (const r of reports) seen.add(r.rule);
        for (const r of reports) {
          expect(GateReportSchema.safeParse(r).success).toBe(true);
          expect(r.actor.length).toBeGreaterThan(0);
          expect(r.rule.length).toBeGreaterThan(0);
          expect(r.hint.length).toBeLessThanOrEqual(200);
        }
        const text = gateReportText(reports);
        expect(reports.length === 0 ? [] : text.split('\n')).toHaveLength(reports.length);
      }),
      { numRuns: RUNS },
    );
    // The generators must actually produce failures, or the property proves nothing.
    expect(reported).toBeGreaterThan(20);
    // Changed by Claude Code: anchor-out-of-range needs both word timings and a beat mutation,
    // so in some seeds 100 runs never produce one and this failed at random (seen in the full
    // run). The two frequent rules stay required; the rare one is checked in gate.test.ts.
    for (const rule of ['content-invalid', 'unknown-id'])
      expect(seen, `no ${rule} report was generated`).toContain(rule);
  });

  it('never throws, is deterministic and does not mutate its inputs', () => {
    fc.assert(
      fc.property(input, ({ su, score }) => {
        const before = JSON.stringify([score, su.o.words, su.o.stress, su.o.durationMs]);
        const frozen = {
          score: deepFreeze(structuredClone(score)),
          o: deepFreeze({ ...su.o, words: su.o.words && structuredClone(su.o.words) }),
        };
        const a = gateSlot(su.scene, frozen.score, frozen.o);
        const b = gateSlot(su.scene, frozen.score, frozen.o);
        expect(b).toEqual(a);
        // A frozen input that something tried to write to would surface as a build error.
        expect(a.some((r) => /could not be built/.test(r.hint))).toBe(false);
        expect(JSON.stringify([frozen.score, frozen.o.words, su.o.stress, su.o.durationMs])).toBe(
          before,
        );
        // The same result on an unfrozen copy.
        expect(gateSlot(su.scene, structuredClone(score), su.o)).toEqual(a);
      }),
      { numRuns: RUNS },
    );
  });

  it('a valid score with no anchors outside the slot has no schema-level reports', () => {
    fc.assert(
      fc.property(
        setup.chain((su) => su.base.map((score) => ({ su, score }))),
        ({ su, score }) => {
          const reports = gateSlot(su.scene, score, su.o);
          expect(reports.filter((r) => r.rule === 'content-invalid')).toEqual([]);
          expect(reports.filter((r) => r.rule === 'unknown-id')).toEqual([]);
          expect(reports.filter((r) => r.rule === 'anchor-out-of-range')).toEqual([]);
        },
      ),
      { numRuns: RUNS },
    );
  });
});

describe('regressions found by the properties', () => {
  it('an empty word list behaves like no word timings (stat-punch at 2.6 s was "read-time")', () => {
    // Found by the task-17 repair-loop property: words: [] gave the focal cue no word to land
    // on, so the defaults failed the read-time gate and safeScore could not pass.
    const o = { format: '16:9' as const, style: fieldNotes, look: fieldNotes, durationMs: 2600 };
    expect(gateSlot(statPunch, statPunch.defaults, { ...o, words: [] })).toEqual(
      gateSlot(statPunch, statPunch.defaults, o),
    );
    expect(gateSlot(statPunch, statPunch.defaults, { ...o, words: [] }).filter(repairable)).toEqual(
      [],
    );
  });
});

// --- 5: safe defaults ---------------------------------------------------------------------

const token = fc.oneof(
  { arbitrary: fc.constantFrom('the', 'revenue', 'why', 'um', 'uh', 'since', 'grew'), weight: 4 },
  {
    arbitrary: fc.constantFrom(
      '40%',
      '$12bn',
      '3.5k',
      '2.5M',
      '$1,234',
      '1,200,000',
      '12',
      '2020',
      '-5%',
      '€3M',
    ),
    weight: 4,
  },
  { arbitrary: fc.integer({ min: 4, max: 220 }).map((n) => 'a'.repeat(n)), weight: 1 },
  { arbitrary: fc.constantFrom('', 'internationalisation', '9999999999999999999999'), weight: 1 },
);

describe('safeScore (properties)', () => {
  it('passes the repairable gates, is deterministic, and is the plain first-variant score', () => {
    fc.assert(
      fc.property(
        fc.array(token, { maxLength: 24 }),
        fc.constantFrom(...CASES),
        fc.constantFrom(...FORMATS_),
        fc.constantFrom('min', 'ideal', 'max', 'between'),
        fc.nat(),
        fc.boolean(),
        (ws, c, format, len, n, plain) => {
          const d = c.scene.durationMs;
          const durationMs = len === 'between' ? d.min + (n % (d.max - d.min + 1)) : d[len];
          const o: GateOptions = {
            format,
            style: plain ? editorialExplainer : fieldNotes,
            ...(plain ? {} : { look: fieldNotes }),
            durationMs,
          };
          const score = safeScore(c.scene, ws, o) as unknown as {
            variant: string;
            beats: unknown[];
            images: unknown[];
          };
          expect(gateSlot(c.scene, score, o).filter(repairable)).toEqual([]);
          expect(safeScore(c.scene, ws, o)).toEqual(score);
          expect(score.variant).toBe(c.scene.variants[0]?.id);
          expect(score.beats).toEqual([]);
          expect(score.images).toEqual([]);
        },
      ),
      { numRuns: RUNS },
    );
  });
});
