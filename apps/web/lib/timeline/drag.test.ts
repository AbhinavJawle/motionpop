import fc from 'fast-check';
import { timelineIssues } from '@motionpop/schemas';
import { describe, expect, it } from 'vitest';
import { moveSlot, resizeSlot } from '../commands';
import { demoProject } from '../projects/fixture';
import { limitsFor } from './constraints';
import { dragModeAt, dragRange } from './drag';
import { wordBoundaries } from './snap';

const p = demoProject();
const PX_PER_MS = 0.068; // the default fit at 1440 px
const bounds = wordBoundaries(p.transcript.words);

describe('dragRange', () => {
  it('snaps a move to the nearest word start within 8 px and keeps the duration', () => {
    // slot-2 starts at 4200 ("revenue"); +60 ms is ~4 px away from 4200 → snaps back.
    const r = dragRange(p, 'slot-2', 'move', 60, PX_PER_MS)!;
    expect(r).toEqual({ startMs: 4200, endMs: 7800, snapped: true });
  });

  it('stops a move at the next slot', () => {
    const r = dragRange(p, 'slot-2', 'move', 5000, PX_PER_MS)!;
    expect(r.endMs).toBe(8700); // slot-3 starts at 8700
    expect(r.snapped).toBe(false);
  });

  it('resizes the end onto a word boundary and respects the component minimum', () => {
    const r = dragRange(p, 'slot-2', 'end', -3000, PX_PER_MS)!;
    expect(r.endMs - r.startMs).toBeGreaterThanOrEqual(limitsFor('big-number').minMs);
  });

  it('property: any drag gives a range the command accepts and keeps invariants', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('slot-1', 'slot-2', 'slot-3', 'slot-4'),
        fc.constantFrom('move' as const, 'start' as const, 'end' as const),
        fc.integer({ min: -20_000, max: 20_000 }),
        (id, mode, delta) => {
          const r = dragRange(p, id, mode, delta, PX_PER_MS, bounds)!;
          const cmd = mode === 'move' ? moveSlot(id, r.startMs) : resizeSlot(id, mode, mode === 'start' ? r.startMs : r.endMs);
          const next = cmd.do(p);
          expect(timelineIssues(next)).toEqual([]);
          const s = next.slots.find((x) => x.id === id)!;
          // The committed slot equals the preview.
          expect([s.startMs, s.endMs]).toEqual([r.startMs, r.endMs]);
          if (r.snapped) {
            const edges = mode === 'move' ? [r.startMs, r.endMs] : [mode === 'start' ? r.startMs : r.endMs];
            expect(edges.some((e) => bounds.includes(e))).toBe(true);
          }
        },
      ),
    );
  });
});

describe('dragModeAt', () => {
  it('picks edges within 8 px and the body otherwise', () => {
    expect(dragModeAt(3, 200)).toBe('start');
    expect(dragModeAt(196, 200)).toBe('end');
    expect(dragModeAt(100, 200)).toBe('move');
    expect(dragModeAt(2, 20)).toBe('move'); // too narrow for handles
  });
});
