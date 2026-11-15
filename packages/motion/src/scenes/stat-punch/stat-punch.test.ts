// @vitest-environment happy-dom
import fc from 'fast-check';
import { FORMATS } from '@motionpop/schemas';
import { describe, expect, it } from 'vitest';
import type { Format } from '../../contract';
import { contains, insetForCamera, safeArea, type Box } from '../../core/safe-area';
import { editorialExplainer } from '../../styles';
import { assertSeekPure } from '../../testing/seek-pure';
import { layoutStatPunch, statPunch, type StatPunchContent } from './index';

const FORMAT_IDS: Format[] = ['16:9', '9:16', '1:1'];
const VARIANTS = statPunch.variants.map((v) => v.id);
const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

const contentArb: fc.Arbitrary<StatPunchContent> = fc.record(
  {
    value: fc.oneof(
      fc.integer({ min: -999, max: 9_999_999 }),
      fc.double({ min: 0, max: 1000, noNaN: true }),
    ),
    prefix: fc.constantFrom('$', '€', '+'),
    suffix: fc.constantFrom('%', 'M', 'k', 'x'),
    decimals: fc.integer({ min: 0, max: 2 }),
    label: fc.string({ minLength: 1, maxLength: 48 }).filter((s) => s.trim().length > 0),
    context: fc.string({ minLength: 1, maxLength: 40 }),
    countFrom: fc.constantFrom(0, 100),
  },
  { requiredKeys: ['value', 'decimals', 'label', 'countFrom'] },
);

describe('stat-punch layout', () => {
  it('keeps every box inside the camera-safe area and apart, for every variant and format', () => {
    for (const format of FORMAT_IDS) {
      const { width, height } = FORMATS[format];
      const safe = insetForCamera(safeArea(format, width, height), width, height, 1.14);
      for (const variant of VARIANTS) {
        for (const hasContext of [true, false]) {
          const slots = layoutStatPunch(variant, format, height, safe, hasContext);
          const boxes = Object.values(slots).map((s) => s.box);
          expect(boxes).toHaveLength(hasContext ? 3 : 2);
          for (const b of boxes) {
            expect(contains(safe, b, 1), `${variant} ${format}`).toBe(true);
            expect(b.width > 0 && b.height > 0).toBe(true);
          }
          boxes.forEach((a, i) =>
            boxes.slice(i + 1).forEach((b) => expect(overlaps(a, b)).toBe(false)),
          );
          expect(slots.number.max).toBeGreaterThan(slots.label.max);
        }
      }
    }
  });

  it('gives each variant a different layout in 16:9', () => {
    const { width, height } = FORMATS['16:9'];
    const safe = safeArea('16:9', width, height);
    const sig = VARIANTS.map((v) =>
      JSON.stringify(layoutStatPunch(v, '16:9', height, safe, true).number.box),
    );
    expect(new Set(sig).size).toBe(VARIANTS.length);
  });
});

describe('stat-punch scene', () => {
  it('parses its defaults and rejects ids that do not exist', () => {
    expect(statPunch.params.safeParse(statPunch.defaults).success).toBe(true);
    const base = { content: statPunch.defaults.content };
    expect(statPunch.params.safeParse({ ...base, variant: 'hero' }).success).toBe(true);
    expect(statPunch.params.safeParse({ ...base, variant: 'sideways' }).success).toBe(false);
    expect(statPunch.params.safeParse({ ...base, beats: [{ cue: 'nope', word: 0 }] }).success).toBe(
      false,
    );
    expect(
      statPunch.params.safeParse({ ...base, images: [{ role: 'x', subject: 'a ship' }] }).success,
    ).toBe(false);
    expect(statPunch.params.safeParse({ content: { value: 4, label: '' } }).success).toBe(false);
  });

  it('lands the exact formatted value on the key moment in every variant and format', () => {
    for (const format of FORMAT_IDS) {
      for (const variant of VARIANTS) {
        const root = document.createElement('div');
        document.body.append(root);
        const comp = statPunch.build(
          {
            root,
            ...FORMATS[format],
            format,
            style: editorialExplainer,
            durationMs: 4200,
            keyMomentMs: 1400,
            fps: 30,
            seed: 5,
            warn: () => {},
          },
          {
            variant,
            content: {
              value: 2.5,
              prefix: '$',
              suffix: 'M',
              decimals: 1,
              label: 'In new revenue',
              countFrom: 0,
            },
            beats: [],
            images: [],
          },
        );
        const cue = comp.report.plan.cues.find((c) => c.id === 'number')!;
        expect(cue.landMs).toBe(1400);
        comp.seek(1400);
        expect(root.querySelector('[data-focal]')!.textContent).toBe('$2.5M');
        expect(comp.report.juice.budgetOk).toBe(true);
        comp.dispose();
        root.remove();
      }
    }
  });

  it('is seek-pure for random content, variants and formats', () => {
    fc.assert(
      fc.property(
        contentArb,
        fc.constantFrom(...VARIANTS),
        fc.constantFrom(...FORMAT_IDS),
        (content, variant, format) => {
          const parsed = statPunch.params.parse({ variant, content });
          assertSeekPure(statPunch, parsed, { format, numRuns: 5 });
        },
      ),
      { numRuns: 25 },
    );
  });
});
