import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { FORMAT_PRESETS, SafeZoneSchema, getSafeArea } from './formats';

const EPS = 1e-9;

function insideFrame(rect: ReturnType<typeof getSafeArea>, width: number, height: number): boolean {
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    rect.x >= 0 &&
    rect.y >= 0 &&
    rect.x + rect.width <= width + EPS &&
    rect.y + rect.height <= height + EPS
  );
}

describe('safe area (Req 5.3)', () => {
  it('every preset leaves a positive drawable area inside the frame', () => {
    for (const preset of Object.values(FORMAT_PRESETS)) {
      expect(insideFrame(getSafeArea(preset), preset.width, preset.height)).toBe(true);
    }
  });

  it('any schema-valid safe zone yields a rect inside the frame', () => {
    const inset = fc.double({ min: 0, max: 0.45, noNaN: true });
    fc.assert(
      fc.property(
        fc.integer({ min: 16, max: 7680 }),
        fc.integer({ min: 16, max: 7680 }),
        fc.record({ top: inset, right: inset, bottom: inset, left: inset }),
        (width, height, safeZone) => {
          fc.pre(SafeZoneSchema.safeParse(safeZone).success);
          return insideFrame(getSafeArea({ width, height, safeZone }), width, height);
        },
      ),
    );
  });
});
