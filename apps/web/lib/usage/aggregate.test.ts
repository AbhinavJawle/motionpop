import {
  LATENCY_BOUNDS_MS,
  LATENCY_BUCKETS,
  emptyUsageDay,
  latencyBucket,
  type UsageDayCounters,
} from '@motionpop/schemas';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  USAGE_DAYS,
  aggregateUsage,
  histogramMedianMs,
  medianLabel,
  windowDays,
  type UsageDay,
} from './aggregate';

const TODAY = '2026-11-20';
const usage = (o: Partial<UsageDayCounters> = {}): UsageDayCounters => ({
  ...emptyUsageDay(),
  ...o,
});
const hist = (...entries: [number, number][]): number[] => {
  const h = Array.from({ length: LATENCY_BUCKETS }, () => 0);
  for (const [i, n] of entries) h[i] = n;
  return h;
};

describe('windowDays', () => {
  it('is the 14 UTC days ending today, oldest first, across month and year ends', () => {
    const w = windowDays('2026-11-20');
    expect(w).toHaveLength(USAGE_DAYS);
    expect(w[0]).toBe('2026-11-07');
    expect(w.at(-1)).toBe('2026-11-20');
    expect(windowDays('2027-01-05')[0]).toBe('2026-12-23');
    expect(windowDays('2028-03-02')).toContain('2028-02-29');
  });
  it('rejects a malformed day', () => {
    expect(() => windowDays('2026-13-45')).toThrow();
    expect(() => windowDays('yesterday')).toThrow();
  });
});

describe('histogramMedianMs', () => {
  it('is null when empty', () => {
    expect(histogramMedianMs(hist())).toBeNull();
  });
  it('reports the upper edge of the bucket where the running total reaches half', () => {
    // 3 calls: 2 under 100 ms, 1 under 250 ms: the median (2nd) is in the first bucket.
    expect(histogramMedianMs(hist([0, 2], [1, 1]))).toBe(100);
    // 4 calls: 2 fast, 2 slow: half is 2, reached in the first bucket.
    expect(histogramMedianMs(hist([0, 2], [3, 2]))).toBe(100);
    // 5 calls: half is 3: reached in bucket 3 (<= 1000 ms).
    expect(histogramMedianMs(hist([0, 2], [3, 3]))).toBe(1000);
  });
  it('reports 120 000 for the open last bucket', () => {
    expect(histogramMedianMs(hist([LATENCY_BUCKETS - 1, 5]))).toBe(120_000);
  });
});

describe('aggregateUsage', () => {
  it('returns 14 zero days for no data', () => {
    const r = aggregateUsage([], TODAY);
    expect(r.days).toHaveLength(14);
    expect(r.days.every((d) => d.device === 0 && d.cloud === 0)).toBe(true);
    expect(r.figures).toEqual({
      deviceCalls: 0,
      medianDeviceMs: null,
      medianCloudMs: null,
      creditsSaved: 0,
    });
  });

  it('puts each day on its UTC date, fills missing days with zeros and ignores days outside', () => {
    const days: UsageDay[] = [
      {
        day: '2026-11-20',
        usage: usage({
          device: 3,
          cloud: 1,
          saved: 5,
          deviceMs: hist([1, 3]),
          cloudMs: hist([5, 1]),
        }),
      },
      { day: '2026-11-07', usage: usage({ device: 2, saved: 2, deviceMs: hist([1, 2]) }) },
      { day: '2026-11-06', usage: usage({ device: 99, saved: 99, deviceMs: hist([1, 99]) }) },
      { day: '2026-11-21', usage: usage({ device: 99, saved: 99 }) },
    ];
    const r = aggregateUsage(days, TODAY);
    expect(r.days[0]).toEqual({ day: '2026-11-07', device: 2, cloud: 0 });
    expect(r.days[13]).toEqual({ day: '2026-11-20', device: 3, cloud: 1 });
    expect(r.days[5]).toEqual({ day: '2026-11-12', device: 0, cloud: 0 });
    expect(r.figures).toMatchObject({
      deviceCalls: 5,
      creditsSaved: 7,
      medianDeviceMs: 250,
      medianCloudMs: 4000,
    });
  });

  it('labels the median', () => {
    expect(medianLabel(500)).toBe('about 0.5 s');
    expect(medianLabel(1000)).toBe('about 1 s');
    expect(medianLabel(15_000)).toBe('about 15 s');
    expect(medianLabel(null)).toBe('n/a');
  });

  // C7 (spec 13): the property of the aggregation.
  const countersArb = fc
    .array(fc.integer({ min: 0, max: 130_000 }), { maxLength: 30 })
    .chain((deviceLat) =>
      fc
        .array(fc.integer({ min: 0, max: 130_000 }), { maxLength: 30 })
        .chain((cloudLat) =>
          fc.integer({ min: 0, max: 40 }).map((saved) => ({ deviceLat, cloudLat, saved })),
        ),
    );
  const toCounters = (c: {
    deviceLat: number[];
    cloudLat: number[];
    saved: number;
  }): UsageDayCounters => {
    const u = emptyUsageDay();
    for (const l of c.deviceLat)
      u.deviceMs[latencyBucket(l)] = (u.deviceMs[latencyBucket(l)] ?? 0) + 1;
    for (const l of c.cloudLat)
      u.cloudMs[latencyBucket(l)] = (u.cloudMs[latencyBucket(l)] ?? 0) + 1;
    return { ...u, device: c.deviceLat.length, cloud: c.cloudLat.length, saved: c.saved };
  };
  const upperEdge = (latencyMs: number): number =>
    LATENCY_BOUNDS_MS[Math.min(latencyBucket(latencyMs), LATENCY_BOUNDS_MS.length - 1)] ?? 0;
  const median = (xs: number[]): number | null => {
    if (xs.length === 0) return null;
    const sorted = [...xs].sort((a, b) => a - b);
    return sorted[Math.ceil(sorted.length / 2) - 1] ?? null;
  };

  it('C7: per-day sums, creditsSaved, window, bucket-exact medians and order independence', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.integer({ min: -20, max: 3 }), countersArb), { maxLength: 24 }),
        fc.integer({ min: 0, max: 5 }),
        (rows, shuffleSeed) => {
          const today = Date.parse(`${TODAY}T00:00:00Z`);
          // Distinct days only (a day appears at most once, as in Firestore).
          const seen = new Set<number>();
          const inputs = rows
            .filter(([off]) => (seen.has(off) ? false : (seen.add(off), true)))
            .map(([off, c]) => ({
              day: new Date(today + off * 86_400_000).toISOString().slice(0, 10),
              off,
              c,
              usage: toCounters(c),
            }));
          const r = aggregateUsage(inputs, TODAY);
          const inside = inputs.filter((i) => i.off >= -13 && i.off <= 0);
          // Per-day counters.
          for (const d of r.days) {
            const hit = inside.find((i) => i.day === d.day);
            expect(d.device).toBe(hit?.c.deviceLat.length ?? 0);
            expect(d.cloud).toBe(hit?.c.cloudLat.length ?? 0);
          }
          expect(r.figures.deviceCalls).toBe(inside.reduce((n, i) => n + i.c.deviceLat.length, 0));
          expect(r.figures.creditsSaved).toBe(inside.reduce((n, i) => n + i.c.saved, 0));
          // Medians are exact to the histogram bucket of the raw median.
          const rawDevice = median(inside.flatMap((i) => i.c.deviceLat));
          const rawCloud = median(inside.flatMap((i) => i.c.cloudLat));
          expect(r.figures.medianDeviceMs).toBe(rawDevice === null ? null : upperEdge(rawDevice));
          expect(r.figures.medianCloudMs).toBe(rawCloud === null ? null : upperEdge(rawCloud));
          // The result does not depend on the order of the input.
          const rotated = [
            ...inputs.slice(shuffleSeed % (inputs.length || 1)),
            ...inputs.slice(0, shuffleSeed % (inputs.length || 1)),
          ].reverse();
          expect(aggregateUsage(rotated, TODAY)).toEqual(r);
          expect(r.days).toHaveLength(14);
        },
      ),
      { numRuns: 200 },
    );
  });
});
