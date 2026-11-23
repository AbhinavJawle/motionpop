import { describe, expect, it } from 'vitest';
import { demoProject } from '@/lib/projects/fixture';
import { openingMs, slotHeroMs } from './key-moment';

describe('opening moment (spec 32 R4.1)', () => {
  it('opens on the first ready graphic, inside its slot', () => {
    const p = demoProject();
    const ready = [...p.slots]
      .sort((a, b) => a.startMs - b.startMs)
      .find((s) => s.status === 'ready');
    expect(ready).toBeDefined();
    const ms = openingMs(p.slots);
    expect(ms).toBe(slotHeroMs(ready!));
    expect(ms).toBeGreaterThanOrEqual(ready!.startMs);
    expect(ms).toBeLessThanOrEqual(ready!.endMs);
  });

  it('the hero frame is never before the key moment and stays inside the slot', () => {
    for (const s of demoProject().slots) {
      const hero = slotHeroMs(s);
      expect(hero).toBeGreaterThanOrEqual(s.startMs);
      expect(hero).toBeLessThanOrEqual(s.endMs);
    }
  });

  it('falls back to the start with no slots', () => {
    expect(openingMs([])).toBe(0);
  });
});
