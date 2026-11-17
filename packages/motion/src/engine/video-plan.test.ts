import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { CompileSlot } from '../compiler/types';
import { companionSig } from './companion';
import { planVideo, STATION_STEP, type VideoPlan } from './video-plan';

type Content = Record<string, unknown>;

/** A slot of `componentId` over `words` (spoken, one word per 400 ms), with params.content. */
function slot(
  id: string,
  componentId: string,
  startMs: number,
  content: Content,
  spoken: string[] = [],
  extra: Record<string, unknown> = {},
): CompileSlot {
  const words = spoken.map((text, i) => ({ text, startMs: i * 400, endMs: i * 400 + 300 }));
  const endMs = startMs + Math.max(3000, words.length * 400 + 600);
  return {
    id,
    startMs,
    endMs,
    componentId,
    params: { content, ...extra },
    words,
  };
}

const stat = (
  id: string,
  startMs: number,
  value: number,
  opts: { suffix?: string; prefix?: string; spoken?: string[] } = {},
) =>
  slot(
    id,
    'stat-punch',
    startMs,
    {
      value,
      decimals: 0,
      label: 'things',
      ...(opts.suffix ? { suffix: opts.suffix } : {}),
      ...(opts.prefix ? { prefix: opts.prefix } : {}),
    },
    opts.spoken ?? [String(value), 'ships', 'waiting'],
  );

const hook = (id: string, startMs: number, line = 'Nobody expected this result') =>
  slot(id, 'hook-statement', startMs, { line }, line.split(' '));

/** Slots laid end to end (each starts when the last one ends, plus a short gap). */
function timeline(slots: Omit<CompileSlot, 'startMs' | 'endMs'>[]): CompileSlot[] {
  let t = 0;
  return slots.map((s) => {
    const words = s.words ?? [];
    const endMs = t + Math.max(3000, words.length * 400 + 600);
    const out = { ...s, startMs: t, endMs };
    t = endMs + 200;
    return out;
  });
}

describe('planVideo: the climax', () => {
  it('picks the strongest number, not the first slot', () => {
    const slots = [
      hook('h', 0),
      stat('pct', 4000, 40, { suffix: '%' }),
      stat('money', 8000, 12, { prefix: '$', suffix: 'bn' }),
      stat('seats', 12000, 300),
    ];
    const plan = planVideo(slots);
    expect(plan.climaxId).toBe('money');
    expect(plan.slots.get('money')?.climax).toBe(true);
    expect(plan.slots.get('money')?.companion).toBeNull();
  });

  it('is never the first slot, even when the first number is the strongest', () => {
    const slots = [
      stat('money', 0, 12, { prefix: '$', suffix: 'bn' }),
      stat('pct', 4000, 40, { suffix: '%' }),
      hook('h', 8000),
    ];
    const plan = planVideo(slots);
    expect(plan.climaxId).not.toBe('money');
    expect(plan.slots.get('money')?.climax).toBe(false);
  });

  it('needs at least 3 slots', () => {
    expect(planVideo([]).climaxId).toBeNull();
    expect(planVideo([stat('a', 0, 5), stat('b', 4000, 99, { suffix: '%' })]).climaxId).toBeNull();
    const three = planVideo([
      hook('h', 0),
      stat('a', 4000, 5),
      stat('b', 8000, 99, { suffix: '%' }),
    ]);
    expect(three.climaxId).toBe('b');
  });

  it('leaves no climax when no slot carries a number', () => {
    const plan = planVideo([hook('a', 0), hook('b', 4000), hook('c', 8000)]);
    expect(plan.climaxId).toBeNull();
  });

  it('is entered from a calm slot, and only the slot right before it is calm', () => {
    const slots = [
      hook('h', 0),
      hook('h2', 4000),
      stat('money', 8000, 12, { prefix: '$', suffix: 'bn' }),
      hook('h3', 12000),
    ];
    const plan = planVideo(slots);
    expect(plan.slots.get('h2')?.calm).toBe(true);
    const calmIds = plan.order.filter((id) => plan.slots.get(id)?.calm);
    expect(calmIds).toEqual(['h2']);
  });
});

describe('planVideo: companions, pictures and long figures', () => {
  it('gives a percentage a unit-grid companion', () => {
    const plan = planVideo([
      hook('h', 0),
      stat('pct', 4000, 40, { suffix: '%', spoken: ['40', 'percent'] }),
    ]);
    expect(plan.slots.get('pct')?.companion).toEqual({
      kind: 'units',
      filled: 40,
      icon: 'percent',
    });
  });

  it('gives a slot with a ready picture no companion', () => {
    const pic = slot(
      'p',
      'stat-punch',
      4000,
      { value: 40, decimals: 0, suffix: '%', label: 'share' },
      ['40', 'percent'],
      { images: [{ assetId: 'asset-1' }] },
    );
    const plan = planVideo([hook('h', 0), pic, hook('h2', 8000)], new Set(['asset-1']));
    expect(plan.slots.get('p')?.companion).toBeNull();
    // A picture that is not ready does not count: the companion stays.
    const notReady = planVideo([pic, hook('h2', 8000)], new Set());
    expect(notReady.slots.get('p')?.companion).not.toBeNull();
  });

  it('gives a long figure ("$1,234,567.89bn") no companion', () => {
    const long = stat('long', 4000, 1234567.89, {
      prefix: '$',
      suffix: 'bn',
      spoken: ['a', 'lot'],
    });
    (long.params as { content: Content }).content['decimals'] = 2;
    const plan = planVideo([hook('h', 0), long]);
    expect(plan.slots.get('long')?.companion).toBeNull();
  });

  it('leaves custom and film slots out of the plan', () => {
    const custom = slot('film', 'custom', 4000, {}, ['x']);
    const plan = planVideo([hook('h', 0), custom, hook('h2', 8000)]);
    expect(plan.slots.has('film')).toBe(false);
    expect(plan.order).toEqual(['h', 'h2']);
  });

  it('drops the companion when a neighbour already shows the same one', () => {
    const plan = planVideo([
      hook('h', 0),
      stat('a', 4000, 6, { spoken: ['6', 'ships'] }),
      stat('b', 8000, 7, { spoken: ['7', 'ships'] }),
    ]);
    expect(plan.slots.get('a')?.companion).toEqual({ kind: 'icons', n: 6, icon: 'ship' });
    expect(plan.slots.get('b')?.companion).toBeNull();
  });
});

describe('planVideo: sides and stations', () => {
  it('alternates the side of consecutive split slots', () => {
    // Two different companions (units, then icons): the variety rule would drop a repeat.
    const plan = planVideo([
      stat('a', 0, 40, { suffix: '%', spoken: ['40', 'percent'] }),
      stat('b', 4000, 6, { spoken: ['6', 'ships'] }),
    ]);
    expect(plan.slots.get('a')?.companion).not.toBeNull();
    expect(plan.slots.get('b')?.companion).not.toBeNull();
    expect(plan.slots.get('a')?.side).not.toBe(plan.slots.get('b')?.side);
  });

  it('places stations left to right, one step per slot', () => {
    const plan = planVideo([hook('h', 0), hook('h2', 4000), hook('h3', 8000)]);
    expect(plan.slots.get('h')?.station.x).toBe(0);
    expect(plan.slots.get('h2')?.station.x).toBeCloseTo(STATION_STEP);
    expect(plan.slots.get('h3')?.station.x).toBeCloseTo(2 * STATION_STEP);
  });
});

/** Random slot lists: numbers, hook lines, a picture, a long figure, and a film beat. */
const slotArb = fc
  .record({
    kind: fc.constantFrom('stat', 'stat', 'stat', 'hook', 'picture', 'long', 'custom'),
    value: fc.integer({ min: 0, max: 900 }),
    suffix: fc.constantFrom('', '%', 'k', 'M', 'bn'),
    prefix: fc.constantFrom('', '$'),
    noun: fc.constantFrom('ships', 'people', 'metres', 'trucks', 'coins', 'growth', 'canal'),
    gap: fc.integer({ min: 0, max: 800 }),
  })
  .map((r) => ({ ...r }));

function build(recs: (typeof slotArb extends fc.Arbitrary<infer T> ? T : never)[]): CompileSlot[] {
  return timeline(
    recs.map((r, i) => {
      const id = `s${i}`;
      if (r.kind === 'hook') {
        const line = 'A line that says something';
        return {
          id,
          componentId: 'hook-statement',
          params: { content: { line } },
          words: line
            .split(' ')
            .map((text, k) => ({ text, startMs: k * 400, endMs: k * 400 + 300 })),
        };
      }
      if (r.kind === 'custom')
        return {
          id,
          componentId: 'custom',
          params: {},
          words: [{ text: 'film', startMs: 0, endMs: 300 }],
        };
      if (r.kind === 'picture')
        return {
          id,
          componentId: 'stat-punch',
          params: {
            content: { value: r.value, decimals: 0, label: 'x' },
            images: [{ assetId: `img-${i}` }],
          },
          words: [{ text: String(r.value), startMs: 0, endMs: 300 }],
        };
      const long = r.kind === 'long';
      const suffix = long ? 'bn' : r.suffix;
      const value = long ? 1234567 : r.value;
      return {
        id,
        componentId: 'stat-punch',
        params: {
          content: {
            value,
            decimals: 0,
            label: 'things',
            ...(suffix ? { suffix } : {}),
            ...(r.prefix && !long ? { prefix: r.prefix } : {}),
          },
        },
        words: [String(value), r.noun, 'waiting'].map((text, k) => ({
          text,
          startMs: k * 400,
          endMs: k * 400 + 300,
        })),
      };
    }),
  );
}

/** Scenes that can carry a companion, as the plan sees them. */
const sceneOf = (s: CompileSlot) => s.componentId;

describe('planVideo properties (spec 07c R3)', () => {
  const listArb = fc.array(slotArb, { maxLength: 10 }).map(build);

  it('is pure: the same slots give the same plan', () => {
    fc.assert(
      fc.property(listArb, (slots) => {
        const a = planVideo(slots);
        const b = planVideo(slots.map((s) => ({ ...s })));
        expect([...a.slots.entries()]).toEqual([...b.slots.entries()]);
        expect(a.order).toEqual(b.order);
        expect(a.climaxId).toBe(b.climaxId);
      }),
    );
  });

  it('plans every non-custom slot once, in time order, and nothing else', () => {
    fc.assert(
      fc.property(listArb, (slots) => {
        const plan = planVideo(slots);
        const expected = slots
          .filter((s) => s.componentId !== 'custom')
          .sort((a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id))
          .map((s) => s.id);
        expect(plan.order).toEqual(expected);
        expect([...plan.slots.keys()].sort()).toEqual([...expected].sort());
      }),
    );
  });

  it('gives a climax only in videos of 3+ slots, never the first, with no companion', () => {
    fc.assert(
      fc.property(listArb, (slots) => {
        const plan = planVideo(slots);
        const n = plan.order.length;
        if (plan.climaxId === null) return;
        expect(n).toBeGreaterThanOrEqual(3);
        expect(plan.order.indexOf(plan.climaxId)).toBeGreaterThan(0);
        expect(plan.slots.get(plan.climaxId)?.companion).toBeNull();
        expect(plan.slots.get(plan.climaxId)?.climax).toBe(true);
      }),
    );
  });

  it('holds exactly the slot before the climax calm', () => {
    fc.assert(
      fc.property(listArb, (slots) => {
        const plan = planVideo(slots);
        const calm = plan.order.filter((id) => plan.slots.get(id)?.calm);
        if (plan.climaxId === null) {
          expect(calm).toEqual([]);
          return;
        }
        const idx = plan.order.indexOf(plan.climaxId);
        expect(calm).toEqual([plan.order[idx - 1]]);
      }),
    );
  });

  it('never gives two neighbours the same scene and companion kind', () => {
    fc.assert(
      fc.property(listArb, (slots) => {
        const plan: VideoPlan = planVideo(slots);
        const byId = new Map(slots.map((s) => [s.id, s]));
        for (let i = 1; i < plan.order.length; i++) {
          const a = plan.slots.get(plan.order[i - 1]!)!;
          const b = plan.slots.get(plan.order[i]!)!;
          const sa = byId.get(plan.order[i - 1]!)!;
          const sb = byId.get(plan.order[i]!)!;
          if (a.companion === null || b.companion === null) continue;
          if (sceneOf(sa) !== sceneOf(sb)) continue;
          expect(companionSig(a.companion)).not.toBe(companionSig(b.companion));
        }
      }),
    );
  });

  it('alternates the side of consecutive split slots (companion or picture)', () => {
    fc.assert(
      fc.property(listArb, (slots) => {
        const plan = planVideo(slots);
        const byId = new Map(slots.map((s) => [s.id, s]));
        const hasPicture = (id: string) =>
          ((byId.get(id)?.params as { images?: unknown[] } | null)?.images ?? []).length > 0;
        const split = plan.order.filter(
          (id) => plan.slots.get(id)?.companion !== null || hasPicture(id),
        );
        for (let i = 1; i < split.length; i++) {
          expect(plan.slots.get(split[i - 1]!)?.side).not.toBe(plan.slots.get(split[i]!)?.side);
        }
      }),
    );
  });

  it('keeps every station inside a bounded band and climbing left to right', () => {
    fc.assert(
      fc.property(listArb, (slots) => {
        const plan = planVideo(slots);
        let last = -Infinity;
        for (const id of plan.order) {
          const st = plan.slots.get(id)!.station;
          expect(st.x).toBeGreaterThan(last);
          expect(Math.abs(st.y)).toBeLessThanOrEqual(0.3);
          last = st.x;
        }
      }),
    );
  });
});
