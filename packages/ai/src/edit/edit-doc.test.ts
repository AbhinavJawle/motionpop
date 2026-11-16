import fc from 'fast-check';
import { components, scenes, schemaFor } from '@motionpop/motion';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  MAX_EDIT_PATHS,
  editDoc,
  editablePaths,
  fieldGuide,
  splitEditDoc,
  timingDefaultsFor,
  type TimingDefaults,
} from './edit-doc';

const DEFAULTS: TimingDefaults = { speed: 1, ease: 'inOut', fade: true };

const statPunch = {
  variant: 'hero',
  content: { value: 40, suffix: '%', decimals: 0, label: 'Revenue grew', countFrom: 0 },
  beats: [{ cue: 'number', word: 2 }],
  images: [],
};
const hook = {
  variant: 'center',
  content: { line: 'This is only the beginning', emphasis: 'beginning' },
  beats: [],
  images: [],
};
const versus = {
  variant: 'split',
  content: { left: 'Renting', right: 'Buying', verdict: 'Buying wins' },
  beats: [],
  images: [],
};
const bigNumber = { value: 40, suffix: '%', decimals: 0, label: 'Revenue grew', countFrom: 0 };

const CASES: [string, Record<string, unknown>][] = [
  ['big-number', bigNumber],
  ['stat-punch', statPunch],
  ['hook-statement', hook],
  ['versus', versus],
];

describe('timingDefaultsFor', () => {
  it('maps the look move ease to the three choices', () => {
    expect(timingDefaultsFor({ moveEase: 'inOutCubic' }).ease).toBe('inOut');
    expect(timingDefaultsFor({ moveEase: 'outExpo' }).ease).toBe('out');
    expect(timingDefaultsFor({ moveEase: 'linear' }).ease).toBe('linear');
    expect(timingDefaultsFor({ moveEase: 'inOutSine' })).toEqual({
      speed: 1,
      ease: 'inOut',
      fade: true,
    });
  });
});

describe('editDoc and splitEditDoc', () => {
  it('merges timing into the params and splits it back', () => {
    const doc = editDoc(bigNumber, { speed: 0.8 }, DEFAULTS);
    expect(doc['timing']).toEqual({ speed: 0.8, ease: 'inOut', fade: true });
    expect(doc['value']).toBe(40);
    expect(splitEditDoc(doc, DEFAULTS)).toEqual({ params: bigNumber, timing: { speed: 0.8 } });
  });

  it('a doc with default timing splits to no timing at all, never an empty object', () => {
    expect(splitEditDoc(editDoc(bigNumber, undefined, DEFAULTS), DEFAULTS).timing).toBeUndefined();
  });

  it('does not mutate its input and does not share nested objects', () => {
    const p = structuredClone(statPunch);
    const doc = editDoc(p, undefined, DEFAULTS);
    (doc['content'] as { value: number }).value = 99;
    expect(p).toEqual(statPunch);
  });

  it('a patched timing is read back; a value equal to the default is dropped', () => {
    const doc = editDoc(bigNumber, { ease: 'out' }, DEFAULTS);
    (doc.timing as Record<string, unknown>)['ease'] = 'inOut';
    (doc.timing as Record<string, unknown>)['fade'] = false;
    expect(splitEditDoc(doc, DEFAULTS).timing).toEqual({ fade: false });
  });
});

describe('editablePaths', () => {
  it('big-number: top-level leaves, optional ones included, then timing', () => {
    expect(editablePaths(schemaFor('big-number')!, bigNumber)).toEqual([
      '/value',
      '/prefix',
      '/suffix',
      '/decimals',
      '/label',
      '/context',
      '/countFrom',
      '/timing/speed',
      '/timing/ease',
      '/timing/fade',
    ]);
  });

  it('stat-punch: content leaves, then the variant, then timing; never beats or images', () => {
    const paths = editablePaths(schemaFor('stat-punch')!, statPunch);
    expect(paths.slice(0, 3)).toEqual(['/content/value', '/content/prefix', '/content/suffix']);
    expect(paths).toContain('/content/label');
    expect(paths).toContain('/variant');
    expect(paths.slice(-3)).toEqual(['/timing/speed', '/timing/ease', '/timing/fade']);
    expect(paths.some((p) => p.startsWith('/beats') || p.startsWith('/images'))).toBe(false);
  });

  it('hook-statement and versus list their text fields', () => {
    expect(editablePaths(schemaFor('hook-statement')!, hook)).toEqual(
      expect.arrayContaining(['/content/line', '/content/emphasis', '/content/subline']),
    );
    const v = editablePaths(schemaFor('versus')!, versus);
    expect(v).toEqual(
      expect.arrayContaining(['/content/left', '/content/right', '/content/winner']),
    );
  });

  it('lists array items by index, only those that exist', () => {
    const schema = z.object({
      title: z.string().max(30).describe('The title'),
      data: z.array(z.object({ label: z.string(), value: z.number() })),
    });
    expect(
      editablePaths(schema, {
        title: 'x',
        data: [
          { label: '2020', value: 1 },
          { label: '2021', value: 2 },
        ],
      }),
    ).toEqual([
      '/title',
      '/data/0/label',
      '/data/0/value',
      '/data/1/label',
      '/data/1/value',
      '/timing/speed',
      '/timing/ease',
      '/timing/fade',
    ]);
    expect(editablePaths(schema, { title: 'x', data: [] }).includes('/data/0/label')).toBe(false);
  });

  it('never offers more than 40 paths, timing last', () => {
    const schema = z.object({ rows: z.array(z.object({ a: z.string(), b: z.number() })) });
    const rows = Array.from({ length: 60 }, () => ({ a: 'x', b: 1 }));
    const paths = editablePaths(schema, { rows });
    expect(paths).toHaveLength(MAX_EDIT_PATHS);
    expect(paths.slice(-3)).toEqual(['/timing/speed', '/timing/ease', '/timing/fade']);
  });

  it('no component or scene schema has a top-level timing key (the merge cannot collide)', () => {
    for (const id of [...Object.keys(components), ...Object.keys(scenes)]) {
      const json = z.toJSONSchema(schemaFor(id)!, { target: 'draft-7', io: 'input' }) as {
        properties?: Record<string, unknown>;
      };
      expect(json.properties, id).toBeDefined();
      const props = json.properties ?? {};
      expect(Object.keys(props), id).not.toContain('timing');
    }
  });
});

describe('fieldGuide', () => {
  it.each(CASES)('%s: one line per path from the descriptions, no schema text', (id, params) => {
    const schema = schemaFor(id)!;
    const paths = editablePaths(schema, params);
    const guide = fieldGuide(schema, paths);
    const lines = guide.split('\n');
    expect(lines).toHaveLength(paths.length);
    lines.forEach((l, i) => expect(l.startsWith(`${paths[i]}: `)).toBe(true));
    expect(guide.length).toBeLessThanOrEqual(2500);
    expect(guide).not.toContain('"type"');
    expect(guide).not.toContain('properties');
  });

  it('describes a number, an enum and a timing path in one line each', () => {
    const guide = fieldGuide(schemaFor('stat-punch')!, [
      '/content/value',
      '/variant',
      '/timing/speed',
      '/timing/fade',
    ]);
    expect(guide).toContain('/content/value: number. The number, exactly as spoken');
    expect(guide).toContain('/variant: one of stack | hero | side.');
    expect(guide).toContain('/timing/speed: number from 0.5 to 2. Speed of entrances');
    expect(guide).toContain('/timing/fade: boolean.');
  });
});

describe('P2 edit doc round-trip', () => {
  const timingArb = fc.record(
    {
      speed: fc.double({ min: 0.5, max: 2, noNaN: true }),
      ease: fc.constantFrom('inOut', 'out', 'linear'),
      fade: fc.boolean(),
    },
    { requiredKeys: [] },
  );
  const defaultsArb = fc.record({
    speed: fc.constantFrom(0.8, 1, 1.25),
    ease: fc.constantFrom('inOut', 'out', 'linear'),
    fade: fc.boolean(),
  }) as fc.Arbitrary<TimingDefaults>;

  it('splitEditDoc(editDoc(p, t, d), d) is { p, t } with default-valued timing keys removed', () => {
    fc.assert(
      fc.property(fc.constantFrom(...CASES), timingArb, defaultsArb, ([, params], timing, d) => {
        const doc = editDoc(params, timing, d);
        const back = splitEditDoc(doc, d);
        expect(back.params).toEqual(params);
        const expected = Object.fromEntries(
          Object.entries(timing).filter(([k, v]) => v !== d[k as keyof TimingDefaults]),
        );
        expect(back.timing ?? {}).toEqual(expected);
        expect(back.timing === undefined || Object.keys(back.timing).length > 0).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  it('editablePaths never names beats or images and offers at most 40 paths', () => {
    fc.assert(
      fc.property(fc.constantFrom(...CASES), ([id, params]) => {
        const paths = editablePaths(schemaFor(id)!, params);
        expect(paths.length).toBeLessThanOrEqual(MAX_EDIT_PATHS);
        expect(new Set(paths).size).toBe(paths.length);
        for (const p of paths) {
          expect(p).toMatch(/^\/[A-Za-z0-9_\-/]*$/);
          expect(p.startsWith('/beats') || p.startsWith('/images')).toBe(false);
        }
      }),
    );
  });
});
