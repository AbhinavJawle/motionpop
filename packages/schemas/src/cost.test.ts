import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  APP_CONFIG_DEFAULTS,
  CreditActionSchema,
  DEFAULT_COSTS,
  costOf,
  exportCost,
  type CostConfig,
} from './index';

const cfg: CostConfig = APP_CONFIG_DEFAULTS;

describe('costOf: the defaults table matches ai-tasks.md', () => {
  it.each([
    ['generate', 3],
    ['edit', 1],
    ['pip-plan', 2],
    ['custom', 3],
    ['slots-detect', 1],
    ['tts', 2],
    ['transcribe', 1],
  ] as const)('%s costs %i for one unit', (action, credits) => {
    expect(costOf(action, 1, cfg)).toBe(credits);
    expect(DEFAULT_COSTS[action]).toBe(credits);
  });

  it('prices images from imageCredits, at least 1', () => {
    expect(costOf('image', 1, { ...cfg, imageCredits: 4 })).toBe(4);
    expect(costOf('image', 1, { ...cfg, imageCredits: 0 })).toBe(1);
  });

  it('multiplies units for slots-detect, tts and transcribe only', () => {
    expect(costOf('slots-detect', 3, cfg)).toBe(3);
    expect(costOf('tts', 4, cfg)).toBe(8);
    expect(costOf('transcribe', 2, cfg)).toBe(2);
    expect(costOf('generate', 5, cfg)).toBe(3);
    expect(costOf('image', 5, cfg)).toBe(cfg.imageCredits);
  });

  it('applies overrides one action at a time', () => {
    const c = { ...cfg, creditCosts: { generate: 2, tts: 5 } };
    expect(costOf('generate', 1, c)).toBe(2);
    expect(costOf('tts', 2, c)).toBe(10);
    expect(costOf('edit', 1, c)).toBe(1);
  });

  it('delegates export to exportCost and ignores units', () => {
    const paid = { ...cfg, exportCredits: { '720p': 3, '1080p': 5 } };
    const opts = { resolution: '1080p', durationMs: 18_000 } as const;
    expect(costOf('export', 1, paid, opts)).toBe(5);
    expect(costOf('export', 9, paid, opts)).toBe(5);
    expect(
      costOf(
        'export',
        1,
        { ...cfg, exportCredits: { '720p': 3, '1080p': 5 } },
        { resolution: '720p', durationMs: 61_000 },
      ),
    ).toBe(6);
    expect(costOf('export', 1, { ...cfg, exportCredits: { '720p': 2, '1080p': 7 } }, opts)).toBe(7);
  });

  it('throws for an export without options and for bad units', () => {
    expect(() => costOf('export', 1, cfg)).toThrow(RangeError);
    for (const units of [0, -1, 1.5, Number.NaN]) {
      expect(() => costOf('generate', units, cfg)).toThrow(RangeError);
    }
  });
});

describe('costOf properties', () => {
  const costs = fc.record(
    {
      generate: fc.integer({ min: 1, max: 20 }),
      edit: fc.integer({ min: 1, max: 20 }),
      'pip-plan': fc.integer({ min: 1, max: 20 }),
      custom: fc.integer({ min: 1, max: 20 }),
      'slots-detect': fc.integer({ min: 1, max: 20 }),
      tts: fc.integer({ min: 1, max: 20 }),
      transcribe: fc.integer({ min: 1, max: 20 }),
    },
    { requiredKeys: [] },
  );

  it('every action costs a positive integer, and the export is the exportCost table value', () => {
    fc.assert(
      fc.property(
        costs,
        fc.integer({ min: 0, max: 40 }),
        fc.integer({ min: 1, max: 20 }),
        fc.integer({ min: 0, max: 600_000 }),
        fc.constantFrom('720p', '1080p'),
        (creditCosts, imageCredits, units, durationMs, resolution) => {
          const c: CostConfig = { ...cfg, creditCosts, imageCredits };
          for (const action of CreditActionSchema.options) {
            if (action === 'export') continue; // free by default (spec 13b R1): checked below
            const v = costOf(action, units, c, { resolution, durationMs });
            expect(Number.isInteger(v)).toBe(true);
            expect(v).toBeGreaterThanOrEqual(1);
          }
          expect(costOf('export', units, c, { resolution, durationMs })).toBe(
            exportCost(resolution, durationMs, c.exportCredits),
          );
        },
      ),
      { numRuns: 300 },
    );
  });

  it('is monotonic in units', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...CreditActionSchema.options.filter((a) => a !== 'export')),
        fc.integer({ min: 1, max: 19 }),
        (action, units) => {
          expect(costOf(action, units + 1, cfg)).toBeGreaterThanOrEqual(costOf(action, units, cfg));
        },
      ),
    );
  });
});

// C8: one export price table. Scans the source for a second definition (a literal 720p/1080p price
// pair or another `exportCost` function). Tests may state the numbers they check.
describe('no second export price', () => {
  const root = resolve(import.meta.dirname, '../../..');
  const SKIP = new Set(['node_modules', '.next', 'dist', '.check', '.turbo', 'coverage']);

  function sources(dir: string, out: string[] = []): string[] {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (SKIP.has(e.name)) continue;
      const full = join(dir, e.name);
      if (e.isDirectory()) sources(full, out);
      else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(full);
    }
    return out;
  }

  it('only render.ts defines the table and the function', () => {
    const files = ['apps', 'packages', 'services'].flatMap((d) => sources(join(root, d)));
    expect(files.length).toBeGreaterThan(50);
    const offenders: string[] = [];
    for (const f of files) {
      if (f.endsWith(join('schemas', 'src', 'render.ts'))) continue;
      const text = readFileSync(f, 'utf8');
      if (
        /DEFAULT_EXPORT_CREDITS\s*[:=]/.test(text) ||
        /function exportCost\b/.test(text) ||
        /['"]?720p['"]?\s*:\s*\d+\s*,\s*['"]?1080p['"]?\s*:\s*\d+/.test(text)
      ) {
        offenders.push(f);
      }
    }
    expect(offenders).toEqual([]);
  });
});
