import {
  emptyUsageDay,
  latencyBucket,
  type UsageDayCounters,
  type UsageEventIn,
} from '@motionpop/schemas';

/**
 * Pure parts of the usage writer (spec 13 R7.1, R7.5): which events of a batch are new and fit
 * under the daily cap, and how they change the day's counters. Only successful calls are counted;
 * failed events are stored but not charted.
 */

export interface SelectedUsage {
  /** Events to store, in batch order. */
  write: UsageEventIn[];
  /** Duplicates (in the batch or already stored) and events over the daily cap. */
  dropped: number;
}

/**
 * Drops ids already stored and repeats within the batch, then keeps at most `capacity` of what
 * is left (the daily cap minus what was written today).
 */
export function selectUsageEvents(
  events: readonly UsageEventIn[],
  existingIds: ReadonlySet<string>,
  capacity: number,
): SelectedUsage {
  const seen = new Set<string>();
  const fresh: UsageEventIn[] = [];
  for (const e of events) {
    if (existingIds.has(e.id) || seen.has(e.id)) continue;
    seen.add(e.id);
    fresh.push(e);
  }
  const write = fresh.slice(0, Math.max(0, capacity));
  return { write, dropped: events.length - write.length };
}

/** The day's counters after adding `events` (the ones actually written). Does not mutate `day`. */
export function addToCounters(
  day: UsageDayCounters | null | undefined,
  events: readonly UsageEventIn[],
): UsageDayCounters {
  const next: UsageDayCounters = day
    ? { ...day, deviceMs: [...day.deviceMs], cloudMs: [...day.cloudMs] }
    : emptyUsageDay();
  for (const e of events) {
    if (!e.ok) continue;
    const bucket = latencyBucket(e.latencyMs);
    if (e.ranOn === 'device') {
      next.device += 1;
      next.saved += e.cloudCost;
      next.deviceMs[bucket] = (next.deviceMs[bucket] ?? 0) + 1;
    } else {
      next.cloud += 1;
      next.cloudMs[bucket] = (next.cloudMs[bucket] ?? 0) + 1;
    }
  }
  return next;
}
