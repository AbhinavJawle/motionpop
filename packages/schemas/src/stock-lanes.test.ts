import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  MAX_TIMELINE_LANES,
  StockAudioClipSchema,
  StockOverlayClipSchema,
  audibleStockAudio,
  cleanedDurationFromSegments,
  keptSourceSegments,
  resolvedAudioLanes,
  resolvedMediaLanes,
  stockAudioPathFor,
  stockOverlayBoxFor,
  stockOverlayPathFor,
  videoDisplaySegments,
  visibleStockOverlays,
} from './index';

describe('spec 45 schemas: multi-lane stock clips, video splits & export paths', () => {
  it('parses stock clips with optional sourceOffsetMs and track while keeping old clips valid', () => {
    const legacyOverlay = StockOverlayClipSchema.parse({
      id: 'ov-1',
      name: 'Sunset',
      src: 'idb:s1',
      kind: 'video',
      mimeType: 'video/mp4',
      startMs: 0,
      endMs: 3000,
    });
    expect(legacyOverlay.sourceOffsetMs).toBeUndefined();
    expect(legacyOverlay.track).toBeUndefined();

    const splitOverlay = StockOverlayClipSchema.parse({
      id: 'ov-2',
      name: 'Sunset (part 2)',
      src: 'idb:s1',
      kind: 'video',
      mimeType: 'video/mp4',
      startMs: 3000,
      endMs: 6000,
      sourceOffsetMs: 3000,
      track: 2,
      layout: 'pip',
    });
    expect(splitOverlay.sourceOffsetMs).toBe(3000);
    expect(splitOverlay.track).toBe(2);

    expect(
      StockOverlayClipSchema.safeParse({ ...splitOverlay, track: MAX_TIMELINE_LANES }).success,
    ).toBe(false);

    const splitAudio = StockAudioClipSchema.parse({
      id: 'sa-1',
      name: 'Pulse',
      src: 'idb:a1',
      kind: 'music',
      mimeType: 'audio/mpeg',
      startMs: 1000,
      endMs: 5000,
      sourceOffsetMs: 2500,
      clipDurationMs: 20_000,
      track: 1,
      volume: 0.4,
    });
    expect(splitAudio.sourceOffsetMs).toBe(2500);
    expect(splitAudio.track).toBe(1);
  });

  it('resolves lanes and filters hidden/muted tracks in deterministic z-order', () => {
    const overlays = [
      StockOverlayClipSchema.parse({
        id: 'top-lane',
        name: 'Top',
        src: 'idb:a',
        kind: 'photo',
        mimeType: 'image/jpeg',
        startMs: 0,
        endMs: 2000,
        track: 2,
      }),
      StockOverlayClipSchema.parse({
        id: 'base-lane',
        name: 'Base',
        src: 'idb:b',
        kind: 'video',
        mimeType: 'video/mp4',
        startMs: 0,
        endMs: 2000,
      }),
      StockOverlayClipSchema.parse({
        id: 'hidden-lane',
        name: 'Hidden',
        src: 'idb:c',
        kind: 'photo',
        mimeType: 'image/png',
        startMs: 0,
        endMs: 2000,
        track: 1,
      }),
    ];
    const lanes = resolvedMediaLanes({
      stockMediaLanes: [{ index: 1, hidden: true }],
      stockOverlays: overlays,
    });
    expect(lanes.map((l) => l.index)).toEqual([0, 1, 2]);

    const visible = visibleStockOverlays({
      stockMediaLanes: [{ index: 1, hidden: true }],
      stockOverlays: overlays,
    });
    expect(visible.map((c) => c.id)).toEqual(['base-lane', 'top-lane']);

    const audio = [
      StockAudioClipSchema.parse({
        id: 'a0',
        name: 'Sfx',
        src: 'idb:x',
        kind: 'sfx',
        mimeType: 'audio/mpeg',
        startMs: 0,
        endMs: 1000,
        volume: 0.9,
      }),
      StockAudioClipSchema.parse({
        id: 'a1',
        name: 'Muted',
        src: 'idb:y',
        kind: 'music',
        mimeType: 'audio/mpeg',
        startMs: 0,
        endMs: 4000,
        track: 1,
        volume: 0.3,
      }),
      StockAudioClipSchema.parse({
        id: 'a2',
        name: 'ZeroVol',
        src: 'idb:z',
        kind: 'sfx',
        mimeType: 'audio/wav',
        startMs: 1000,
        endMs: 2000,
        track: 2,
        volume: 0,
      }),
    ];
    expect(
      resolvedAudioLanes({ stockAudioLanes: [{ index: 1, muted: true }], stockAudio: audio }).map(
        (l) => l.index,
      ),
    ).toEqual([0, 1, 2]);
    expect(
      audibleStockAudio({ stockAudioLanes: [{ index: 1, muted: true }], stockAudio: audio }).map(
        (c) => c.id,
      ),
    ).toEqual(['a0']);
  });

  it('returns valid normalized boxes for every stock overlay layout', () => {
    for (const layout of ['full', 'top', 'pip', 'card'] as const) {
      const box = stockOverlayBoxFor(layout);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.w).toBeGreaterThan(0);
      expect(box.h).toBeGreaterThan(0);
      expect(box.x + box.w).toBeLessThanOrEqual(1.0001);
      expect(box.y + box.h).toBeLessThanOrEqual(1.0001);
    }
  });

  it('validates owner-scoped stock overlay and stock audio storage paths strictly', () => {
    const ovRe = stockOverlayPathFor('u1', 'proj_1');
    expect(ovRe.test('users/u1/video/proj_1/stock-ov-0123456789abcdef.mp4')).toBe(true);
    expect(ovRe.test('users/u1/video/proj_1/stock-ov-0123456789abcdef.png')).toBe(true);
    expect(ovRe.test('users/u2/video/proj_1/stock-ov-0123456789abcdef.mp4')).toBe(false);
    expect(ovRe.test('users/u1/video/proj_1/stock-ov-0123456789abcdef.svg')).toBe(false);

    const auRe = stockAudioPathFor('u1', 'proj_1');
    expect(auRe.test('users/u1/audio/proj_1/stock-au-0123456789abcdef.mp3')).toBe(true);
    expect(auRe.test('users/u1/audio/proj_1/stock-au-0123456789abcdef.wav')).toBe(true);
    expect(auRe.test('users/u2/audio/proj_1/stock-au-0123456789abcdef.mp3')).toBe(false);
    expect(auRe.test('users/u1/audio/proj_1/stock-au-0123456789abcdef.exe')).toBe(false);
  });

  it('property: videoDisplaySegments partitions kept segments losslessly with no gaps or overlaps', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1000, max: 60_000 }),
        fc.array(
          fc.record({
            startMs: fc.integer({ min: 0, max: 60_000 }),
            endMs: fc.integer({ min: 0, max: 60_000 }),
            enabled: fc.boolean(),
          }),
          { maxLength: 8 },
        ),
        fc.array(fc.integer({ min: 0, max: 60_000 }), { maxLength: 12 }),
        (origDur, rawCuts, splits) => {
          const cuts = rawCuts.map((c) => ({
            startMs: Math.min(c.startMs, c.endMs),
            endMs: Math.max(c.startMs, c.endMs),
            enabled: c.enabled,
          }));
          const kept = keptSourceSegments(origDur, cuts);
          const expectedTotal = cleanedDurationFromSegments(kept);
          const display = videoDisplaySegments(origDur, cuts, splits);

          let cursor = 0;
          for (let i = 0; i < display.length; i++) {
            const seg = display[i]!;
            expect(seg.index).toBe(i);
            expect(seg.endMs).toBeGreaterThan(seg.startMs);
            expect(seg.timelineStartMs).toBe(cursor);
            expect(seg.timelineEndMs).toBe(cursor + (seg.endMs - seg.startMs));
            if (i > 0) {
              expect(seg.startMs).toBeGreaterThanOrEqual(display[i - 1]!.endMs);
            }
            cursor = seg.timelineEndMs;
          }
          expect(cursor).toBe(expectedTotal);
        },
      ),
      { numRuns: 100 },
    );
  });
});
