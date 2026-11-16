import 'server-only';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import {
  DailyLimitsSchema,
  type AppConfig,
  type UsageBatch,
  type UsageEventIn,
} from '@motionpop/schemas';
import { addToCounters, selectUsageEvents } from './usage-logic';

export interface UsageWriteResult {
  written: number;
  dropped: number;
}

/** The stored event: the input without its id (the doc id), plus the schema version and a server time. */
function eventDoc(e: UsageEventIn): Record<string, unknown> {
  return {
    task: e.task,
    ranOn: e.ranOn,
    model: e.model,
    credits: e.credits,
    cloudCost: e.cloudCost,
    latencyMs: e.latencyMs,
    ok: e.ok,
    ...(e.attempts === undefined ? {} : { attempts: e.attempts }),
    ...(e.problems === undefined ? {} : { problems: e.problems }),
    clientAt: e.clientAt,
    schemaVersion: 1,
    at: FieldValue.serverTimestamp(),
  };
}

/**
 * Stores a batch of usage events (spec 13 R7.1, R7.5) in ONE transaction: it reads the day doc and
 * the event refs, drops ids that exist, caps the day at `usageEventsPerDay`, creates the rest, and
 * adds the written successful events to `limits/{day}.usage` and the count to `usageEvents`. So
 * the counters Settings reads always equal the event documents. At most 50 events: 51 writes.
 */
export async function writeUsage(
  db: Firestore,
  uid: string,
  batch: UsageBatch,
  cfg: Pick<AppConfig, 'usageEventsPerDay'>,
  nowMs: number = Date.now(),
): Promise<UsageWriteResult> {
  const day = new Date(nowMs).toISOString().slice(0, 10);
  const limitsRef = db.doc(`users/${uid}/limits/${day}`);
  const eventRefs = batch.events.map((e) => db.doc(`users/${uid}/usage/${e.id}`));
  return db.runTransaction(async (t) => {
    const [limitsSnap, ...eventSnaps] = await t.getAll(limitsRef, ...eventRefs);
    const limits = limitsSnap?.exists ? DailyLimitsSchema.parse(limitsSnap.data()) : null;
    const existing = new Set(
      eventSnaps.flatMap((s, i) => (s?.exists ? [batch.events[i]?.id ?? ''] : [])),
    );
    const capacity = cfg.usageEventsPerDay - (limits?.usageEvents ?? 0);
    const { write, dropped } = selectUsageEvents(batch.events, existing, capacity);
    if (write.length === 0) return { written: 0, dropped };
    for (const e of write) t.create(db.doc(`users/${uid}/usage/${e.id}`), eventDoc(e));
    t.set(
      limitsRef,
      {
        schemaVersion: 1,
        usageEvents: (limits?.usageEvents ?? 0) + write.length,
        usage: addToCounters(limits?.usage, write),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    return { written: write.length, dropped };
  });
}
