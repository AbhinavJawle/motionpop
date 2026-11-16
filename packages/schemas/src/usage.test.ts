import { describe, expect, it } from 'vitest';
import {
  LATENCY_BOUNDS_MS,
  LATENCY_BUCKETS,
  UsageBatchSchema,
  UsageDayCountersSchema,
  UsageEventDocSchema,
  emptyUsageDay,
  latencyBucket,
} from './index';

const event = {
  id: 'abcdefgh12345678',
  task: 'edit.patch',
  ranOn: 'device',
  model: 'gemini-nano',
  credits: 0,
  cloudCost: 1,
  latencyMs: 420,
  ok: true,
  clientAt: 1_700_000_000_000,
};

describe('usage schemas', () => {
  it('accepts a batch of 1..50 events and rejects 0 or 51', () => {
    expect(UsageBatchSchema.safeParse({ events: [event] }).success).toBe(true);
    expect(UsageBatchSchema.safeParse({ events: [] }).success).toBe(false);
    expect(
      UsageBatchSchema.safeParse({ events: Array.from({ length: 51 }, () => event) }).success,
    ).toBe(false);
  });

  it.each([
    ['short id', { id: 'short' }],
    ['id with a slash', { id: 'abcdefgh/1234567' }],
    ['unknown route', { ranOn: 'moon' }],
    ['negative latency', { latencyMs: -1 }],
    ['fractional credits', { credits: 0.5 }],
    ['credits over 50', { credits: 51 }],
    ['zero attempts', { attempts: 0 }],
    ['four problems', { problems: ['a', 'b', 'c', 'd'] }],
    ['long problem', { problems: ['x'.repeat(201)] }],
    ['empty task', { task: '' }],
  ])('rejects %s', (_, patch) => {
    expect(UsageBatchSchema.safeParse({ events: [{ ...event, ...patch }] }).success).toBe(false);
  });

  it('a stored event has no id and carries schemaVersion and a timestamp', () => {
    const rest: Partial<typeof event> = { ...event };
    delete rest.id;
    expect(
      UsageEventDocSchema.safeParse({ ...rest, schemaVersion: 1, at: new Date(0) }).success,
    ).toBe(true);
    expect(UsageEventDocSchema.safeParse({ ...rest, schemaVersion: 1 }).success).toBe(false);
  });

  it('day counters have 12 histogram buckets, and the empty day parses', () => {
    expect(LATENCY_BUCKETS).toBe(12);
    expect(UsageDayCountersSchema.safeParse(emptyUsageDay()).success).toBe(true);
    expect(UsageDayCountersSchema.safeParse({ ...emptyUsageDay(), cloudMs: [0, 0] }).success).toBe(
      false,
    );
  });

  it('latencyBucket maps edges inclusively and everything slower to the last bucket', () => {
    expect(latencyBucket(0)).toBe(0);
    expect(latencyBucket(100)).toBe(0);
    expect(latencyBucket(101)).toBe(1);
    expect(latencyBucket(120_000)).toBe(10);
    expect(latencyBucket(120_001)).toBe(11);
    expect(latencyBucket(600_000)).toBe(11);
    expect(LATENCY_BOUNDS_MS).toHaveLength(11);
  });
});
