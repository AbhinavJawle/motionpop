import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Energy, SlotStatus } from '@motionpop/schemas';
import {
  SFX_FRAME_LAG_MS,
  SFX_MIN_GAP_MS,
  SFX_TICK_GAIN_DB,
  placeSfx,
  type SfxPlacement,
  type SfxSlot,
} from './place';
import { SFX_TAKES } from './synth';

const words = (n: number, gap = 400) =>
  Array.from({ length: n }, (_, i) => ({ startMs: i * gap, endMs: i * gap + 300, filler: false }));

const slot = (
  id: string,
  startMs: number,
  endMs: number,
  componentId: string,
  extra: Partial<SfxSlot> = {},
): SfxSlot => ({
  id,
  startMs,
  endMs,
  wordStart: Math.floor(startMs / 400),
  wordEnd: Math.floor((endMs - 1) / 400),
  componentId,
  status: 'ready',
  ...extra,
});

const project = <S extends SfxSlot>(slots: S[], durationMs = 40_000) => ({
  durationMs,
  slots,
  transcript: { words: words(Math.ceil(durationMs / 400)) },
});

const key = () => 1000;

describe('placeSfx cases', () => {
  it('a number scene gets a whoosh on its entrance and a pop one frame after its key moment', () => {
    const out = placeSfx(project([slot('a', 2000, 6000, 'stat-punch')]), () => 1500, 0);
    expect(out.map((p) => [p.kind, p.atMs])).toEqual([
      ['whoosh', 2000 + SFX_FRAME_LAG_MS],
      ['pop', 3500 + SFX_FRAME_LAG_MS],
    ]);
  });

  it('a word-by-word text scene gets ticks at -6 dB, at most 4, 1.2 s apart, and no whoosh', () => {
    const out = placeSfx(project([slot('h', 0, 12_000, 'hook-statement')]), key, 0);
    expect(out.every((p) => p.kind === 'tick' && p.gainDb === SFX_TICK_GAIN_DB)).toBe(true);
    expect(out).toHaveLength(4);
    expect(out.map((p) => p.atMs)).toEqual([33, 1233, 2433, 3633]);
  });

  it('a callout and an unknown component get nothing', () => {
    expect(
      placeSfx(project([slot('c', 0, 4000, 'custom'), slot('u', 5000, 9000, 'nope')]), key, 0),
    ).toEqual([]);
  });

  it('skips slots that are not ready', () => {
    const s = slot('a', 2000, 6000, 'stat-punch', { status: 'suggested' as SlotStatus });
    expect(placeSfx(project([s]), key, 0)).toEqual([]);
  });

  it('the first hype slot gets a rise into an impact instead of its pop, once', () => {
    const out = placeSfx(
      project([
        slot('a', 0, 4000, 'big-number', { energy: 'hype' }),
        slot('b', 6000, 10_000, 'big-number', { energy: 'hype' }),
      ]),
      key,
      0,
    );
    const impact = out.filter((p) => p.kind === 'impact');
    const rise = out.filter((p) => p.kind === 'rise');
    expect(impact).toHaveLength(1);
    expect(rise).toHaveLength(1);
    expect(impact[0]).toMatchObject({ slotId: 'a', atMs: 1000 + SFX_FRAME_LAG_MS });
    expect(rise[0]?.atMs).toBe(impact[0]?.atMs);
    expect(out.find((p) => p.kind === 'pop')?.slotId).toBe('b');
  });

  it('no hype slot, no rise and no impact', () => {
    const out = placeSfx(project([slot('a', 0, 4000, 'big-number', { energy: 'lively' })]), key, 0);
    expect(out.some((p) => p.kind === 'impact' || p.kind === 'rise')).toBe(false);
  });

  it('drops the lower-priority effect when two are closer than 1.2 s', () => {
    // Key moment 200 ms in: the pop (higher) is 200 ms after the whoosh, so the whoosh goes.
    const out = placeSfx(project([slot('a', 2000, 6000, 'big-number')]), () => 200, 0);
    expect(out.map((p) => p.kind)).toEqual(['pop']);
  });

  it('places nothing when auto effects are off', () => {
    const p = {
      ...project([slot('a', 2000, 6000, 'stat-punch')]),
      audio: {
        musicGainDb: -18,
        ducking: true,
        duckDepthDb: 8,
        autoSfx: false,
        sfxGainDb: 0,
        sfxSeed: 0,
      },
    };
    expect(placeSfx(p, key, 0)).toEqual([]);
  });

  it('a key moment past the slot end is clamped into the slot', () => {
    const out = placeSfx(project([slot('a', 2000, 4000, 'big-number')]), () => 99_999, 0);
    expect(out.find((p) => p.kind === 'pop')?.atMs).toBe(4000);
  });

  it('consecutive pops on neighbouring slots use different takes', () => {
    const slots = Array.from({ length: 6 }, (_, i) =>
      slot(`s${i}`, i * 5000, i * 5000 + 4000, 'big-number'),
    );
    const pops = placeSfx(project(slots), key, 7).filter((p) => p.kind === 'pop');
    for (let i = 1; i < pops.length; i++) expect(pops[i]?.take).not.toBe(pops[i - 1]?.take);
  });
});

// ---------- property 6 ----------

const IDS = ['big-number', 'stat-punch', 'versus', 'hook-statement', 'custom', 'unknown'];
const ENERGIES: (Energy | undefined)[] = ['calm', 'steady', 'lively', 'hype', undefined];
const STATUSES: SlotStatus[] = ['ready', 'ready', 'ready', 'suggested', 'failed'];

const projectArb = fc
  .record({
    cuts: fc.uniqueArray(fc.integer({ min: 0, max: 60 }), { minLength: 2, maxLength: 24 }),
    kinds: fc.array(
      fc.record({
        id: fc.constantFrom(...IDS),
        energy: fc.constantFrom(...ENERGIES),
        status: fc.constantFrom(...STATUSES),
        keyFrac: fc.double({ min: -0.2, max: 1.3, noNaN: true }),
      }),
      { minLength: 12, maxLength: 12 },
    ),
    seed: fc.nat(),
  })
  .map(({ cuts, kinds, seed }) => {
    const pts = [...cuts].sort((a, b) => a - b).map((c) => c * 500);
    const slots: (SfxSlot & { keyFrac: number })[] = [];
    for (let i = 0; i + 1 < pts.length; i += 2) {
      const k = kinds[(i / 2) % kinds.length]!;
      const s = slot(`s${i}`, pts[i]!, pts[i + 1]!, k.id, {
        status: k.status,
        ...(k.energy ? { energy: k.energy } : {}),
      });
      slots.push({ ...s, keyFrac: k.keyFrac });
    }
    return { p: project(slots, 30_000), seed };
  });

const keyOf = (s: SfxSlot & { keyFrac: number }) => (s.endMs - s.startMs) * s.keyFrac;

describe('placeSfx property 6', () => {
  it('inside their slots, 1.2 s apart, one rise+impact at most, takes differ, deterministic', () => {
    fc.assert(
      fc.property(projectArb, ({ p, seed }) => {
        const out = placeSfx(p, keyOf, seed);
        expect(placeSfx(p, keyOf, seed)).toEqual(out);
        const byId = new Map(p.slots.map((s) => [s.id, s]));
        for (const x of out) {
          const s = byId.get(x.slotId)!;
          expect(s.status).toBe('ready');
          expect(x.atMs).toBeGreaterThanOrEqual(s.startMs);
          expect(x.atMs).toBeLessThanOrEqual(Math.min(s.endMs, p.durationMs));
          expect(Number.isInteger(x.atMs)).toBe(true);
          expect(x.take).toBeGreaterThanOrEqual(0);
          expect(x.take).toBeLessThan(SFX_TAKES[x.kind]);
        }
        // Sorted by time.
        for (let i = 1; i < out.length; i++)
          expect(out[i]!.atMs).toBeGreaterThanOrEqual(out[i - 1]!.atMs);
        // Spacing: every pair except the rise (it rides on its impact).
        const spaced = out.filter((x) => x.kind !== 'rise');
        for (let i = 1; i < spaced.length; i++)
          expect(spaced[i]!.atMs - spaced[i - 1]!.atMs).toBeGreaterThanOrEqual(SFX_MIN_GAP_MS);
        const impacts = out.filter((x) => x.kind === 'impact');
        const rises = out.filter((x) => x.kind === 'rise');
        expect(impacts.length).toBeLessThanOrEqual(1);
        expect(rises.length).toBe(impacts.length);
        if (impacts[0]) expect(rises[0]?.atMs).toBe(impacts[0].atMs);
        const hype = p.slots.some((s) => s.status === 'ready' && s.energy === 'hype');
        if (!hype) expect(impacts).toHaveLength(0);
        // Consecutive same-kind takes differ.
        const last: Partial<Record<SfxPlacement['kind'], number>> = {};
        for (const x of out) {
          if (SFX_TAKES[x.kind] > 1 && last[x.kind] !== undefined)
            expect(x.take).not.toBe(last[x.kind]);
          last[x.kind] = x.take;
        }
        // Ticks only on word-by-word scenes, at most 4 per slot.
        const ticks = new Map<string, number>();
        for (const x of out.filter((y) => y.kind === 'tick')) {
          expect(byId.get(x.slotId)?.componentId).toBe('hook-statement');
          ticks.set(x.slotId, (ticks.get(x.slotId) ?? 0) + 1);
        }
        for (const n of ticks.values()) expect(n).toBeLessThanOrEqual(4);
      }),
      { numRuns: 300 },
    );
  });
});
