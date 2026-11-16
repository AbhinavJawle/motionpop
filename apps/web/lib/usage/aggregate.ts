import { LATENCY_BOUNDS_MS, LATENCY_BUCKETS, type UsageDayCounters } from '@motionpop/schemas';

/** Days shown by the chart. */
export const USAGE_DAYS = 14;

export interface UsageDay {
  /** UTC day, `yyyy-mm-dd`. */
  day: string;
  usage: UsageDayCounters;
}

export interface UsageChartDay {
  day: string;
  device: number;
  cloud: number;
}

export interface UsageFigures {
  deviceCalls: number;
  /** Upper edge (ms) of the median's histogram bucket; null with no calls. */
  medianDeviceMs: number | null;
  medianCloudMs: number | null;
  creditsSaved: number;
}

export interface UsageSummary {
  days: UsageChartDay[];
  figures: UsageFigures;
}

const DAY_MS = 86_400_000;
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** The 14 UTC days ending at `todayUtc`, oldest first. Throws for a malformed day. */
export function windowDays(todayUtc: string, count: number = USAGE_DAYS): string[] {
  const end = Date.parse(`${todayUtc}T00:00:00Z`);
  if (!DAY_KEY.test(todayUtc) || Number.isNaN(end))
    throw new RangeError(`bad UTC day: ${todayUtc}`);
  return Array.from({ length: count }, (_, i) =>
    new Date(end - (count - 1 - i) * DAY_MS).toISOString().slice(0, 10),
  );
}

/**
 * The median of a latency histogram: the upper edge of the first bucket whose running total
 * reaches half of the calls (the last, open bucket reports its lower edge, 120 000). Exact to
 * the bucket. Null for an empty histogram.
 */
export function histogramMedianMs(buckets: readonly number[]): number | null {
  const total = buckets.reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  const half = Math.ceil(total / 2);
  let run = 0;
  for (let i = 0; i < LATENCY_BUCKETS; i++) {
    run += buckets[i] ?? 0;
    if (run >= half) return LATENCY_BOUNDS_MS[Math.min(i, LATENCY_BOUNDS_MS.length - 1)] ?? null;
  }
  return null;
}

/**
 * Settings' chart data from the day counters of `limits/{day}` (spec 13 R7.3, R7.5). Pure: fills
 * the 14 UTC days ending today with zeros for missing docs, ignores days outside them, sums a
 * day that appears twice, and does not depend on the input order.
 */
export function aggregateUsage(days: readonly UsageDay[], todayUtc: string): UsageSummary {
  const window = windowDays(todayUtc);
  const inWindow = new Set(window);
  const byDay = new Map<string, { device: number; cloud: number }>();
  const deviceMs: number[] = Array.from({ length: LATENCY_BUCKETS }, () => 0);
  const cloudMs: number[] = Array.from({ length: LATENCY_BUCKETS }, () => 0);
  let saved = 0;
  let deviceCalls = 0;
  for (const { day, usage } of days) {
    if (!inWindow.has(day)) continue;
    const cur = byDay.get(day) ?? { device: 0, cloud: 0 };
    cur.device += usage.device;
    cur.cloud += usage.cloud;
    byDay.set(day, cur);
    deviceCalls += usage.device;
    saved += usage.saved;
    for (let i = 0; i < LATENCY_BUCKETS; i++) {
      deviceMs[i] = (deviceMs[i] ?? 0) + (usage.deviceMs[i] ?? 0);
      cloudMs[i] = (cloudMs[i] ?? 0) + (usage.cloudMs[i] ?? 0);
    }
  }
  return {
    days: window.map((day) => ({ day, ...(byDay.get(day) ?? { device: 0, cloud: 0 }) })),
    figures: {
      deviceCalls,
      medianDeviceMs: histogramMedianMs(deviceMs),
      medianCloudMs: histogramMedianMs(cloudMs),
      creditsSaved: saved,
    },
  };
}

/** "about 0.6 s" for a median in ms; "n/a" for none. */
export function medianLabel(ms: number | null): string {
  if (ms === null) return 'n/a';
  const s = ms / 1000;
  return `about ${s < 10 ? Number(s.toFixed(1)) : Math.round(s)} s`;
}
