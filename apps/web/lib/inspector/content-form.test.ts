import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { schemaFor } from '@/lib/motion/registry';
import {
  contentForm,
  displayValue,
  labelOf,
  parseFieldInput,
  setField,
  type Field,
} from './content-form';

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
  content: { left: 'Renting', right: 'Buying', verdict: 'Buying wins', winner: 'right' },
  beats: [],
  images: [],
};
const bigNumber = { value: 40, suffix: '%', decimals: 0, label: 'Revenue grew', countFrom: 0 };
const form = (id: string, params: Record<string, unknown>) => contentForm(schemaFor(id)!, params);
const paths = (fields: Field[]) => fields.map((f) => f.path);

describe('contentForm on the registered ids', () => {
  it('big-number: the label is the title, numbers and short texts are table rows, ember on the value', () => {
    const f = form('big-number', bigNumber);
    expect(f[0]).toMatchObject({
      kind: 'text',
      path: '/label',
      title: true,
      value: 'Revenue grew',
    });
    // Other texts, then the table in schema order.
    expect(paths(f)).toEqual([
      '/label',
      '/context',
      '/value',
      '/prefix',
      '/suffix',
      '/decimals',
      '/countFrom',
    ]);
    expect(f.find((x) => x.path === '/value')).toMatchObject({
      kind: 'number',
      focal: true,
      value: 40,
    });
    expect(f.find((x) => x.path === '/decimals')).toMatchObject({
      int: true,
      min: 0,
      max: 2,
      focal: false,
    });
    expect(f.find((x) => x.path === '/suffix')).toMatchObject({
      kind: 'short',
      value: '%',
      max: 4,
    });
    expect(f.find((x) => x.path === '/context')).toMatchObject({
      kind: 'text',
      title: false,
      required: false,
    });
  });

  it('stat-punch: the same fields under /content, and never beats, images or the variant', () => {
    const f = form('stat-punch', statPunch);
    expect(paths(f)).toEqual([
      '/content/label',
      '/content/context',
      '/content/value',
      '/content/prefix',
      '/content/suffix',
      '/content/decimals',
      '/content/countFrom',
    ]);
    expect(paths(f).some((p) => /beats|images|variant/.test(p))).toBe(false);
  });

  it('hook-statement: the line is the title, the rest are compact fields, no table', () => {
    const f = form('hook-statement', hook);
    expect(f[0]).toMatchObject({ kind: 'text', path: '/content/line', title: true });
    expect(paths(f)).toEqual([
      '/content/line',
      '/content/eyebrow',
      '/content/emphasis',
      '/content/subline',
    ]);
    expect(f.every((x) => x.kind === 'text')).toBe(true);
  });

  it('versus: the first side is the title and the winner is a dropdown', () => {
    const f = form('versus', versus);
    expect(f[0]).toMatchObject({ kind: 'text', path: '/content/left', title: true });
    const winner = f.find((x) => x.path === '/content/winner');
    expect(winner).toMatchObject({ kind: 'enum', value: 'right', options: ['left', 'right'] });
    expect(f.at(-1)).toBe(winner);
  });

  it('a focal path overrides the first number', () => {
    const f = contentForm(schemaFor('big-number')!, bigNumber, '/countFrom');
    expect(f.find((x) => x.path === '/countFrom')).toMatchObject({ focal: true });
    expect(f.find((x) => x.path === '/value')).toMatchObject({ focal: false });
  });

  it('empty params (a suggested slot) give empty fields, not a crash', () => {
    for (const id of ['big-number', 'stat-punch', 'hook-statement', 'versus']) {
      expect(() => form(id, {})).not.toThrow();
    }
    expect(form('big-number', {})[0]).toMatchObject({ kind: 'text', value: '' });
  });

  it('unknown shapes: arrays of { label, value } become rows', () => {
    const schema = z.object({
      title: z.string().max(60),
      data: z.array(z.object({ label: z.string(), value: z.number() })),
      smooth: z.boolean().optional(),
      nested: z.object({ a: z.string() }),
    });
    const f = contentForm(schema, {
      title: 'Revenue',
      data: [
        { label: '2020', value: 100000 },
        { label: '2021', value: 120000 },
      ],
    });
    expect(f.map((x) => x.kind)).toEqual(['text', 'bool', 'rows']);
    expect(f[2]).toMatchObject({
      kind: 'rows',
      rows: [
        { label: '2020', value: 100000, valuePath: '/data/0/value' },
        { label: '2021', value: 120000, valuePath: '/data/1/value' },
      ],
    });
  });
});

describe('labelOf', () => {
  it('turns keys into sentence case', () => {
    expect(labelOf('countFrom')).toBe('Count from');
    expect(labelOf('leftDetail')).toBe('Left detail');
    expect(labelOf('line')).toBe('Line');
  });
});

describe('setField', () => {
  it('sets, removes and creates, on a copy', () => {
    const before = structuredClone(statPunch);
    const a = setField(statPunch, '/content/value', 45);
    expect((a['content'] as Record<string, unknown>)['value']).toBe(45);
    expect(statPunch).toEqual(before);
    const b = setField(statPunch, '/content/suffix', undefined);
    expect('suffix' in (b['content'] as object)).toBe(false);
    const c = setField({}, '/content/label', 'x');
    expect(c).toEqual({ content: { label: 'x' } });
  });
});

describe('parseFieldInput', () => {
  const number = form('big-number', bigNumber).find((f) => f.path === '/value')!;
  it('reads numbers the way people type them', () => {
    expect(parseFieldInput(number, '45')).toEqual({ ok: true, value: 45 });
    expect(parseFieldInput(number, '1,200')).toEqual({ ok: true, value: 1200 });
    expect(parseFieldInput(number, '1.2k')).toEqual({ ok: true, value: 1200 });
    expect(parseFieldInput(number, '40%')).toEqual({ ok: true, value: 40 });
    expect(parseFieldInput(number, '-3')).toEqual({ ok: true, value: -3 });
  });
  it('rejects text in a number field, and an empty required field', () => {
    expect(parseFieldInput(number, 'lots').ok).toBe(false);
    expect(parseFieldInput(number, '').ok).toBe(false);
    const title = form('big-number', bigNumber)[0]!;
    expect(parseFieldInput(title, '  ')).toMatchObject({ ok: false });
    expect(parseFieldInput(title, ' Hi ')).toEqual({ ok: true, value: 'Hi' });
  });
  it('an empty optional field removes the value', () => {
    const suffix = form('big-number', bigNumber).find((f) => f.path === '/suffix')!;
    expect(parseFieldInput(suffix, '')).toEqual({ ok: true, value: undefined });
  });
});

// P6: committing every field with its current value leaves the params deep-equal, and setField never mutates.
describe('P6 content form round-trip', () => {
  const text = (max: number, min = 1) =>
    fc
      .stringMatching(/^[A-Za-z][A-Za-z0-9 ]{0,40}$/)
      .map((s) => s.slice(0, max).trim())
      .filter((s) => s.length >= min);
  const bigArb = fc.record({
    value: fc.integer({ min: -9999, max: 999999 }),
    prefix: fc.option(fc.constantFrom('$', '€', '+'), { nil: undefined }),
    suffix: fc.option(fc.constantFrom('%', 'M', 'k', 'bn'), { nil: undefined }),
    decimals: fc.integer({ min: 0, max: 2 }),
    label: text(48),
    context: fc.option(text(60), { nil: undefined }),
    countFrom: fc.integer({ min: 0, max: 100 }),
  });
  const statArb = bigArb.map((content) => ({
    variant: 'stack',
    content,
    beats: [],
    images: [],
  }));
  const hookArb = fc
    .record({ line: text(90), eyebrow: fc.option(text(32), { nil: undefined }) })
    .map((content) => ({ variant: 'center', content, beats: [], images: [] }));
  const versusArb = fc
    .record({
      left: text(24),
      right: text(24),
      winner: fc.option(fc.constantFrom('left', 'right'), { nil: undefined }),
    })
    .map((content) => ({ variant: 'split', content, beats: [], images: [] }));

  const clean = (o: Record<string, unknown>) =>
    JSON.parse(JSON.stringify(o)) as Record<string, unknown>;

  const roundTrip = (id: string, params: Record<string, unknown>) => {
    const schema = schemaFor(id)!;
    const valid = schema.safeParse(params);
    if (!valid.success) return; // only valid content is in scope
    const start = clean(valid.data as Record<string, unknown>);
    const frozen = structuredClone(start);
    let cur = start;
    for (const f of contentForm(schema, start)) {
      if (f.kind === 'rows') continue;
      // The real commit path: the field's own text, parsed the way the input parses it.
      const typed = f.kind === 'bool' ? String(f.value === true) : displayValue(f);
      if (f.kind === 'bool' && f.value === undefined) continue;
      const parsed = parseFieldInput(f, typed);
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;
      const next = setField(cur, f.path, parsed.value);
      expect(cur).toEqual(clean(cur)); // untouched input
      cur = clean(next);
    }
    expect(cur).toEqual(frozen);
    expect(start).toEqual(frozen);
    const parsed = schema.safeParse(cur);
    expect(parsed.success).toBe(true);
  };

  it('big-number', () => {
    fc.assert(
      fc.property(bigArb, (p) => roundTrip('big-number', p)),
      { numRuns: 150 },
    );
  });
  it('stat-punch', () => {
    fc.assert(
      fc.property(statArb, (p) => roundTrip('stat-punch', p)),
      { numRuns: 150 },
    );
  });
  it('hook-statement', () => {
    fc.assert(
      fc.property(hookArb, (p) => roundTrip('hook-statement', p)),
      { numRuns: 150 },
    );
  });
  it('versus', () => {
    fc.assert(
      fc.property(versusArb, (p) => roundTrip('versus', p)),
      { numRuns: 150 },
    );
  });

  it('typing a field’s own text back parses to the same value', () => {
    fc.assert(
      fc.property(bigArb, (p) => {
        const schema = schemaFor('big-number')!;
        const valid = schema.safeParse(p);
        if (!valid.success) return;
        for (const f of contentForm(schema, valid.data as Record<string, unknown>)) {
          if (f.kind !== 'number' || f.value === undefined) continue;
          expect(parseFieldInput(f, String(f.value))).toEqual({ ok: true, value: f.value });
        }
      }),
      { numRuns: 150 },
    );
  });
});
