import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { FormatSchema, type EditorProject, type Format, type Slot } from '@motionpop/schemas';
import { arbitrary as bigNumberParams } from '../components/big-number/samples';
import { arbitrary as hookParams } from '../scenes/hook-statement/samples';
import { arbitrary as statParams } from '../scenes/stat-punch/samples';
import { lookFor } from '../registry';
import { editorialExplainer, looks, stylePacks } from '../styles';
import { fixtureProject, fixtureWords } from '../testing/project-fixture';
import { isRenderable, projectCompileInput } from './project';

// P9 (spec 08 §19): the preview and the render compile the same project the same way. They may
// differ only in `mode`, `voiceSrc` and `background`; the style id on the input is the project's.

const format: fc.Arbitrary<Format> = fc.constantFrom(...FormatSchema.options);
const knownStyleIds = [...Object.keys(looks), ...Object.keys(stylePacks)];
const styleId = fc.oneof(
  fc.constantFrom(...knownStyleIds),
  fc.constantFrom('toString', '__proto__', 'constructor'),
  fc.string({ minLength: 1, maxLength: 16 }),
);
const status = fc.constantFrom<Slot['status']>('ready', 'ready', 'ready', 'suggested', 'failed');

const asParams = (p: object): Record<string, unknown> => ({ ...p });

/** Slot contents: valid and invalid params, known and unknown components, image slots. */
const content: fc.Arbitrary<Pick<Slot, 'componentId' | 'params'>> = fc.oneof(
  {
    weight: 3,
    arbitrary: bigNumberParams.map((p) => ({ componentId: 'big-number', params: asParams(p) })),
  },
  {
    weight: 3,
    arbitrary: statParams.map((p) => ({ componentId: 'stat-punch', params: asParams(p) })),
  },
  {
    weight: 3,
    arbitrary: hookParams.map((p) => ({ componentId: 'hook-statement', params: asParams(p) })),
  },
  {
    weight: 1,
    arbitrary: statParams.map((p) => ({
      componentId: 'stat-punch',
      params: { ...asParams(p), images: [{ id: 'img-1', url: 'blob:x' }] },
    })),
  },
  { weight: 1, arbitrary: fc.constant({ componentId: 'big-number', params: { value: 'x' } }) },
  { weight: 1, arbitrary: fc.constant({ componentId: 'no-such-component', params: {} }) },
);

/** 0–5 slots that sit on whole words, apart from each other (the schema checks the timeline). */
const slots: fc.Arbitrary<Slot[]> = fc
  .uniqueArray(fc.integer({ min: 0, max: fixtureWords.length }), { minLength: 0, maxLength: 10 })
  .map((cuts) => cuts.sort((a, b) => a - b))
  .chain((cuts) => {
    const ranges: Array<[number, number]> = [];
    for (let i = 0; i + 1 < cuts.length; i += 2) ranges.push([cuts[i]!, cuts[i + 1]! - 1]);
    return fc.tuple(...ranges.map(() => fc.tuple(content, status))).map((parts) =>
      parts.map(([c, st], i): Slot => {
        const [a, b] = ranges[i]!;
        return {
          id: `slot-${i}`,
          startMs: fixtureWords[a]!.startMs,
          endMs: fixtureWords[b]!.endMs,
          wordStart: a,
          wordEnd: b,
          reason: 'property',
          skillId: 'data-explainer',
          prompt: '',
          status: st,
          notes: [],
          ...c,
        };
      }),
    );
  });

const project: fc.Arbitrary<EditorProject> = fc
  .tuple(format, styleId, slots)
  .map(([f, s, sl]) => fixtureProject({ format: f, styleId: s, slots: sl }));

describe('P9 preview–render input parity', () => {
  it('differs only in mode, voiceSrc and background, for every format', () => {
    fc.assert(
      fc.property(project, format, (p, f) => {
        const preview = projectCompileInput(p, { mode: 'preview', format: f });
        const render = projectCompileInput(p, {
          mode: 'render',
          format: f,
          background: 'style',
          voiceSrc: 'assets/voice.wav',
        });
        const strip = ({ mode, voiceSrc, background, ...rest }: typeof preview) => {
          void mode;
          void voiceSrc;
          void background;
          return rest;
        };
        expect(strip(render)).toEqual(strip(preview));
        expect(render.slots.map((s) => s.id)).toEqual(preview.slots.map((s) => s.id));
        expect(preview.format).toBe(f);
        expect(render.mode).toBe('render');
        expect(preview.mode).toBe('preview');
      }),
      { numRuns: 200 },
    );
  });

  it('compiles exactly the renderable slots, in project order, and no image or unready slot', () => {
    fc.assert(
      fc.property(project, format, (p, f) => {
        const input = projectCompileInput(p, { mode: 'render', format: f });
        const expected = p.slots.filter((s) => isRenderable(s, f)).map((s) => s.id);
        expect(input.slots.map((s) => s.id)).toEqual(expected);
        for (const s of input.slots) {
          const source = p.slots.find((x) => x.id === s.id)!;
          expect(source.status).toBe('ready');
          expect(source.params['images'] ?? []).toEqual([]);
          expect({ start: s.startMs, end: s.endMs, c: s.componentId, params: s.params }).toEqual({
            start: source.startMs,
            end: source.endMs,
            c: source.componentId,
            params: source.params,
          });
        }
      }),
      { numRuns: 200 },
    );
  });

  it("uses the project's style id for any id the registry knows, else the editorial explainer", () => {
    fc.assert(
      fc.property(project, (p) => {
        const known = Object.hasOwn(looks, p.styleId) || Object.hasOwn(stylePacks, p.styleId);
        for (const mode of ['preview', 'render'] as const) {
          const input = projectCompileInput(p, { mode });
          expect(input.style).toBe(lookFor(p.styleId));
          if (known) expect(input.style.id).toBe(p.styleId);
          else expect(input.style).toBe(editorialExplainer);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('the generator covers the cases the properties are about (not vacuous)', () => {
    const sample = fc.sample(project, { numRuns: 300, seed: 9 });
    const compiled = sample.map((p) => projectCompileInput(p, { mode: 'render' }).slots.length);
    expect(compiled.some((n) => n > 0)).toBe(true);
    expect(sample.some((p) => p.slots.some((s) => s.status !== 'ready'))).toBe(true);
    expect(sample.some((p) => p.slots.some((s) => s.params['images']))).toBe(true);
    expect(sample.some((p) => p.slots.some((s) => s.componentId === 'no-such-component'))).toBe(
      true,
    );
    expect(new Set(sample.map((p) => p.format)).size).toBe(3);
    expect(sample.some((p) => Object.hasOwn(looks, p.styleId))).toBe(true);
  });

  it('every known style id resolves to itself', () => {
    for (const id of knownStyleIds) expect(lookFor(id).id).toBe(id);
  });

  it('keeps the project format when none is given', () => {
    fc.assert(
      fc.property(project, (p) => {
        expect(projectCompileInput(p, { mode: 'preview' }).format).toBe(p.format);
      }),
      { numRuns: 50 },
    );
  });
});
