import fc from 'fast-check';
import { timelineIssues } from '@motionpop/schemas';
import { describe, expect, it } from 'vitest';
import { addSlot } from '../commands';
import { demoProject } from '../projects/fixture';
import { slotForWords } from './create';

describe('slotForWords', () => {
  const p = demoProject();

  it('widens a short word to the 1 s minimum inside its gap', () => {
    // "Our" (3550–3980) sits between slot 1 (ends 3180) and slot 2 (starts 4200).
    const s = slotForWords(p, 5, 5, 'new')!;
    expect([s.startMs, s.endMs]).toEqual([3200, 4200]);
    expect(s.componentId).toBe('title-card');
    expect(timelineIssues(addSlot(s).do(p))).toEqual([]);
  });

  it('returns null when the words are already under a slot', () => {
    expect(slotForWords(p, 6, 8, 'new')).toBeNull();
  });

  it('creates a slot that the AddSlot command accepts, in a project without slots', () => {
    const empty = { ...p, slots: [] };
    const s = slotForWords(empty, 8, 9, 'new')!;
    // "forty percent" is 1.25 s; a big number needs 2.6 s, so it is widened.
    expect(s.startMs).toBe(5580);
    expect(s.endMs).toBe(8180);
    expect(s.reason).toBe("You said 'forty percent since 2020'"); // the widened range covers more words
    expect(s.componentId).toBe('big-number');
    expect(timelineIssues(addSlot(s).do(empty))).toEqual([]);
  });

  it('property: any word range in an empty project gives a valid, accepted slot', () => {
    const empty = { ...p, slots: [] };
    const n = empty.transcript.words.length;
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: n - 1 }),
        fc.integer({ min: 0, max: n - 1 }),
        (a, b) => {
          const s = slotForWords(empty, a, b, 'x');
          if (!s) return;
          expect(s.endMs - s.startMs).toBeGreaterThanOrEqual(1000);
          expect(() => addSlot(s).do(empty)).not.toThrow();
        },
      ),
    );
  });
});
