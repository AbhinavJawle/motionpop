import { addToCounters } from './usage-logic';
import type { UsageDayCounters, UsageEventIn } from '@motionpop/schemas';

/**
 * This session's usage events, in memory (spec 13 R7.4): what Settings charts in local mode
 * (no Firebase), labelled "This session". Resets on reload.
 */
const events: UsageEventIn[] = [];
const listeners = new Set<() => void>();
let counters: UsageDayCounters = addToCounters(null, []);

export function recordSessionUsage(e: UsageEventIn): void {
  events.push(e);
  counters = addToCounters(null, events);
  for (const l of listeners) l();
}

export function subscribeSessionUsage(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** The session's counters. The reference changes only when an event arrives. */
export function getSessionUsage(): UsageDayCounters {
  return counters;
}

/** Test support. */
export function resetSessionUsage(): void {
  events.length = 0;
  counters = addToCounters(null, []);
  for (const l of listeners) l();
}
