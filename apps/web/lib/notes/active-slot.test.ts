import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { demoProject } from '@/lib/projects/fixture';
import { noteProjectMs, noteTimeFor, slotAt } from './active-slot';

describe('slotAt', () => {
  const slots = demoProject(0).slots;
  it('finds the slot under the playhead, start inclusive and end exclusive', () => {
    expect(slotAt(slots, 5600)?.id).toBe('slot-2');
    expect(slotAt(slots, 4200)?.id).toBe('slot-2');
    expect(slotAt(slots, 7800)?.id).not.toBe('slot-2');
  });
  it('is null in a gap and before the first slot', () => {
    expect(slotAt(slots, 100)).toBeNull();
    expect(slotAt(slots, 3500)).toBeNull();
  });
});

describe('note time', () => {
  it('the demo note shows at project time 5600 on slot 2 (D-048)', () => {
    const slot = demoProject(0).slots.find((s) => s.id === 'slot-2')!;
    expect(noteProjectMs(slot, slot.notes[0]!.tMs)).toBe(5600);
  });
  it('property: a note made inside a slot has a time inside it, as an integer', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100_000 }),
        fc.integer({ min: 1, max: 12_000 }),
        fc.integer({ min: -5000, max: 120_000 }),
        (start, len, ms) => {
          const slot = { startMs: start, endMs: start + len };
          const t = noteTimeFor(slot, ms);
          expect(Number.isInteger(t)).toBe(true);
          expect(t).toBeGreaterThanOrEqual(0);
          expect(t).toBeLessThan(len);
          if (ms >= start && ms < start + len) expect(noteProjectMs(slot, t)).toBe(Math.round(ms));
        },
      ),
    );
  });
});
