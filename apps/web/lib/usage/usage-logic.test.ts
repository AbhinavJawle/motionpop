import { UsageDayCountersSchema, latencyBucket, type UsageEventIn } from '@motionpop/schemas';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { addToCounters, selectUsageEvents } from './usage-logic';

const ev = (o: Partial<UsageEventIn> = {}): UsageEventIn => ({
  id: 'evt-00000001',
  task: 'edit.patch',
  ranOn: 'device',
  model: 'nano',
  credits: 0,
  cloudCost: 1,
  latencyMs: 300,
  ok: true,
  clientAt: 1,
  ...o,
});

const eventArb: fc.Arbitrary<UsageEventIn> = fc.record({
  id: fc.stringMatching(/^[a-z0-9]{8,12}$/),
  task: fc.constantFrom('edit.patch', 'component.fill', 'slots.detect'),
  ranOn: fc.constantFrom('device', 'cloud'),
  model: fc.constantFrom('nano', 'flash'),
  credits: fc.integer({ min: 0, max: 5 }),
  cloudCost: fc.integer({ min: 0, max: 5 }),
  latencyMs: fc.oneof(
    fc.integer({ min: 0, max: 130_000 }),
    fc.constantFrom(100, 101, 250, 120_000),
  ),
  ok: fc.boolean(),
  clientAt: fc.integer({ min: 0, max: 2_000_000_000 }),
});

describe('selectUsageEvents', () => {
  it('drops stored ids and repeats within the batch, keeps the order', () => {
    const a = ev({ id: 'aaaaaaaa' });
    const b = ev({ id: 'bbbbbbbb' });
    const c = ev({ id: 'cccccccc' });
    const r = selectUsageEvents([a, b, a, c], new Set(['bbbbbbbb']), 100);
    expect(r.write.map((e) => e.id)).toEqual(['aaaaaaaa', 'cccccccc']);
    expect(r.dropped).toBe(2);
  });

  it('caps at the capacity left, and a full day writes nothing', () => {
    const events = ['aaaaaaaa', 'bbbbbbbb', 'cccccccc'].map((id) => ev({ id }));
    expect(selectUsageEvents(events, new Set(), 2).write.map((e) => e.id)).toEqual([
      'aaaaaaaa',
      'bbbbbbbb',
    ]);
    expect(selectUsageEvents(events, new Set(), 0)).toEqual({ write: [], dropped: 3 });
    expect(selectUsageEvents(events, new Set(), -4).write).toEqual([]);
  });

  it('property: written + dropped = batch size, written ≤ capacity, ids unique and never stored', () => {
    fc.assert(
      fc.property(
        fc.array(eventArb, { maxLength: 50 }),
        fc.array(fc.stringMatching(/^[a-z0-9]{8,12}$/), { maxLength: 10 }),
        fc.integer({ min: 0, max: 60 }),
        (events, stored, capacity) => {
          const r = selectUsageEvents(events, new Set(stored), capacity);
          expect(r.write.length + r.dropped).toBe(events.length);
          expect(r.write.length).toBeLessThanOrEqual(capacity);
          const ids = r.write.map((e) => e.id);
          expect(new Set(ids).size).toBe(ids.length);
          for (const id of ids) expect(stored).not.toContain(id);
        },
      ),
    );
  });
});

describe('addToCounters', () => {
  it('counts ok calls per route, saved credits and one histogram bucket each', () => {
    const c = addToCounters(null, [
      ev({ latencyMs: 90, cloudCost: 1 }),
      ev({ latencyMs: 700, cloudCost: 3 }),
      ev({ ranOn: 'cloud', latencyMs: 2500, cloudCost: 3 }),
    ]);
    expect(c.device).toBe(2);
    expect(c.cloud).toBe(1);
    expect(c.saved).toBe(4);
    expect(c.deviceMs[latencyBucket(90)]).toBe(1);
    expect(c.deviceMs[latencyBucket(700)]).toBe(1);
    expect(c.cloudMs[latencyBucket(2500)]).toBe(1);
  });

  it('does not count failed events and does not mutate its input', () => {
    const before = addToCounters(null, [ev()]);
    const copy = structuredClone(before);
    const after = addToCounters(before, [ev({ ok: false }), ev({ id: 'zzzzzzzz' })]);
    expect(before).toEqual(copy);
    expect(after.device).toBe(2);
  });

  it('property: the counters equal a direct count of the ok events, and always parse', () => {
    fc.assert(
      fc.property(fc.array(eventArb, { maxLength: 60 }), (events) => {
        const half = Math.floor(events.length / 2);
        // Adding in two steps equals adding at once.
        const stepped = addToCounters(
          addToCounters(null, events.slice(0, half)),
          events.slice(half),
        );
        const once = addToCounters(null, events);
        expect(stepped).toEqual(once);
        expect(UsageDayCountersSchema.safeParse(once).success).toBe(true);
        const okDevice = events.filter((e) => e.ok && e.ranOn === 'device');
        const okCloud = events.filter((e) => e.ok && e.ranOn === 'cloud');
        expect(once.device).toBe(okDevice.length);
        expect(once.cloud).toBe(okCloud.length);
        expect(once.saved).toBe(okDevice.reduce((n, e) => n + e.cloudCost, 0));
        expect(once.deviceMs.reduce((a, b) => a + b, 0)).toBe(okDevice.length);
        expect(once.cloudMs.reduce((a, b) => a + b, 0)).toBe(okCloud.length);
      }),
    );
  });
});
