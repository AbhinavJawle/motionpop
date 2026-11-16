import { describe, expect, it } from 'vitest';
import { DailyLimitsSchema, DayKeySchema, emptyUsageDay } from './index';

const at = { toMillis: () => 1_700_000_000_000 };

describe('DailyLimitsSchema', () => {
  it('accepts a server-written doc with a Firestore timestamp or a Date', () => {
    // Changed by spec 13: the parsed doc also carries the defaults of the new counters.
    expect(DailyLimitsSchema.parse({ schemaVersion: 1, planCloud: 0, updatedAt: at })).toEqual({
      schemaVersion: 1,
      planCloud: 0,
      renders: 0,
      aiByHour: {},
      refunds: 0,
      usageEvents: 0,
      usage: emptyUsageDay(),
      updatedAt: at,
    });
    expect(
      DailyLimitsSchema.safeParse({ schemaVersion: 1, planCloud: 10, updatedAt: new Date(0) })
        .success,
    ).toBe(true);
  });

  // Spec 08 review F1: each writer uses `merge` and writes only its own counter, so a day doc
  // may have either counter alone. Both must parse, or the next export or plan call would throw.
  it('parses a day doc written only by an export (no planCloud)', () => {
    const doc = DailyLimitsSchema.parse({ schemaVersion: 1, renders: 2, updatedAt: at });
    expect(doc).toMatchObject({ schemaVersion: 1, planCloud: 0, renders: 2, updatedAt: at });
  });

  it('parses a day doc written only by a plan call (no renders)', () => {
    const doc = DailyLimitsSchema.parse({ schemaVersion: 1, planCloud: 4, updatedAt: at });
    expect(doc.renders).toBe(0);
    expect(doc.planCloud).toBe(4);
  });

  it('keeps both counters when both writers have run', () => {
    const doc = DailyLimitsSchema.parse({
      schemaVersion: 1,
      planCloud: 3,
      renders: 1,
      updatedAt: at,
    });
    expect([doc.planCloud, doc.renders]).toEqual([3, 1]);
  });

  // Spec 13: three writers (plan allowance, export start, the credit and usage routes) merge into
  // one day doc, each writing only its own keys. Any subset must parse.
  it('parses a day doc written by 08, the plan allowance and spec 13 together', () => {
    const usage = { ...emptyUsageDay(), device: 2, saved: 2 };
    usage.deviceMs[3] = 2;
    const doc = DailyLimitsSchema.parse({
      schemaVersion: 1,
      planCloud: 3,
      renders: 1,
      aiByHour: { '00': 4, '23': 1 },
      refunds: 2,
      usageEvents: 9,
      usage,
      updatedAt: at,
    });
    expect([doc.planCloud, doc.renders, doc.aiByHour['23'], doc.refunds, doc.usageEvents]).toEqual([
      3, 1, 1, 2, 9,
    ]);
    expect(doc.usage.deviceMs[3]).toBe(2);
  });

  it('parses a day doc with only spec 13 keys (no planCloud, no renders)', () => {
    const doc = DailyLimitsSchema.parse({ schemaVersion: 1, aiByHour: { '07': 1 }, updatedAt: at });
    expect([doc.planCloud, doc.renders, doc.refunds, doc.usageEvents]).toEqual([0, 0, 0, 0]);
  });

  it('gives each parsed doc its own default objects', () => {
    const a = DailyLimitsSchema.parse({ schemaVersion: 1, updatedAt: at });
    const b = DailyLimitsSchema.parse({ schemaVersion: 1, updatedAt: at });
    a.aiByHour['01'] = 5;
    a.usage.deviceMs[0] = 5;
    expect(b.aiByHour).toEqual({});
    expect(b.usage.deviceMs[0]).toBe(0);
  });

  it.each([
    ['bad hour key', { schemaVersion: 1, aiByHour: { '24': 1 }, updatedAt: at }],
    ['negative hour count', { schemaVersion: 1, aiByHour: { '01': -1 }, updatedAt: at }],
    ['negative refunds', { schemaVersion: 1, refunds: -1, updatedAt: at }],
    ['fractional usageEvents', { schemaVersion: 1, usageEvents: 0.5, updatedAt: at }],
    [
      'short histogram',
      { schemaVersion: 1, usage: { ...emptyUsageDay(), deviceMs: [0] }, updatedAt: at },
    ],
    ['negative renders', { schemaVersion: 1, renders: -1, updatedAt: at }],
    ['fractional renders', { schemaVersion: 1, renders: 0.5, updatedAt: at }],
    ['negative count', { schemaVersion: 1, planCloud: -1, updatedAt: at }],
    ['fractional count', { schemaVersion: 1, planCloud: 1.5, updatedAt: at }],
    ['unknown version', { schemaVersion: 2, planCloud: 1, updatedAt: at }],
    ['missing timestamp', { schemaVersion: 1, planCloud: 1 }],
    ['epoch number as timestamp', { schemaVersion: 1, planCloud: 1, updatedAt: 1 }],
  ])('rejects a %s', (_, doc) => {
    expect(DailyLimitsSchema.safeParse(doc).success).toBe(false);
  });
});

describe('DayKeySchema', () => {
  it('accepts real UTC days, including a leap day', () => {
    for (const k of ['2026-11-15', '2026-12-31', '2028-02-29']) {
      expect(DayKeySchema.safeParse(k).success).toBe(true);
    }
  });

  it('rejects other shapes and impossible days', () => {
    for (const k of ['2026-2-01', '2026-02-30', '2026-13-01', '2027-02-29', '20261115', '']) {
      expect(DayKeySchema.safeParse(k).success).toBe(false);
    }
  });
});
