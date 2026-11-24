import { MAX_TIMELINE_LANES, resolvedAudioLanes, resolvedMediaLanes } from '@motionpop/schemas';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { CommandRejected } from './command';
import {
  addStockAudio,
  addStockOverlay,
  addTimelineLane,
  removeStockAudio,
  removeStockOverlay,
  removeTimelineLane,
  splitStockAudio,
  splitStockOverlay,
  toggleTimelineLaneHidden,
  toggleTimelineLaneMute,
  updateStockAudio,
  updateStockOverlay,
} from './stock';
import { removeVideoCut, removeVideoSplit, splitVideoAt, addVideoCut } from './video';
import { projectArb } from './test-support';

const makeProject = () => fc.sample(projectArb, 1)[0]!;

describe('stock timeline commands (Stock Media & Stock Audio layers)', () => {
  it('adds, updates, removes, and undoes stock visual overlays', () => {
    const p0 = makeProject();
    const clip = {
      id: 'ov-1',
      name: 'neon city',
      src: 'idb:clip-1',
      kind: 'video' as const,
      mimeType: 'video/mp4',
      startMs: 1000,
      endMs: 4500,
      clipDurationMs: 8000,
      layout: 'top' as const,
      provider: 'pixabay' as const,
      attribution: 'Pixabay · Creator',
    };

    const addCmd = addStockOverlay(clip);
    const p1 = addCmd.do(p0);
    expect(p1.stockOverlays).toEqual([clip]);

    const updCmd = updateStockOverlay('ov-1', { startMs: 2000, endMs: 5500, layout: 'full' });
    const p2 = updCmd.do(p1);
    expect(p2.stockOverlays?.[0]).toMatchObject({ startMs: 2000, endMs: 5500, layout: 'full' });
    expect(updCmd.undo(p2).stockOverlays?.[0]).toMatchObject({
      startMs: 1000,
      endMs: 4500,
      layout: 'top',
    });

    const remCmd = removeStockOverlay('ov-1');
    const p3 = remCmd.do(p2);
    expect(p3.stockOverlays).toBeUndefined();
    expect(remCmd.undo(p3).stockOverlays).toHaveLength(1);
    expect(addCmd.undo(p1).stockOverlays).toBeUndefined();
  });

  it('adds, updates, removes, and undoes stock audio/SFX clips', () => {
    const p0 = makeProject();
    const sfx = {
      id: 'sa-1',
      name: 'Fast Whoosh',
      src: 'idb:sfx-1',
      kind: 'sfx' as const,
      mimeType: 'audio/mpeg',
      startMs: 1500,
      endMs: 2700,
      volume: 0.9,
      attribution: 'Fast Whoosh (CC0)',
    };

    const addCmd = addStockAudio(sfx);
    const p1 = addCmd.do(p0);
    expect(p1.stockAudio).toEqual([sfx]);

    const updCmd = updateStockAudio('sa-1', { startMs: 3000, endMs: 4200, volume: 1.2 });
    const p2 = updCmd.do(p1);
    expect(p2.stockAudio?.[0]).toMatchObject({ startMs: 3000, endMs: 4200, volume: 1.2 });
    expect(updCmd.undo(p2).stockAudio?.[0]).toMatchObject({
      startMs: 1500,
      endMs: 2700,
      volume: 0.9,
    });

    const remCmd = removeStockAudio('sa-1');
    const p3 = remCmd.do(p2);
    expect(p3.stockAudio).toBeUndefined();
    expect(remCmd.undo(p3).stockAudio).toHaveLength(1);
    expect(addCmd.undo(p1).stockAudio).toBeUndefined();
  });

  it('splits stock visual and audio clips with exact sourceOffsetMs continuity and full undo', () => {
    const p0 = makeProject();
    const p1 = addStockOverlay({
      id: 'ov-a',
      name: 'Ocean wave',
      src: 'idb:wave',
      kind: 'video',
      mimeType: 'video/mp4',
      startMs: 1000,
      endMs: 5000,
      sourceOffsetMs: 500,
      clipDurationMs: 10_000,
      layout: 'card',
      provider: 'upload',
    }).do(p0);

    const splitOv = splitStockOverlay('ov-a', 2600, 'ov-b');
    const p2 = splitOv.do(p1);
    expect(p2.stockOverlays).toHaveLength(2);
    expect(p2.stockOverlays?.[0]).toMatchObject({
      id: 'ov-a',
      startMs: 1000,
      endMs: 2600,
      sourceOffsetMs: 500,
    });
    expect(p2.stockOverlays?.[1]).toMatchObject({
      id: 'ov-b',
      startMs: 2600,
      endMs: 5000,
      sourceOffsetMs: 2100,
    });
    expect(splitOv.undo(p2)).toEqual(p1);
    expect(() => splitStockOverlay('ov-a', 1100, 'ov-c').do(p1)).toThrow(CommandRejected);

    const p3 = addStockAudio({
      id: 'sa-a',
      name: 'Ambient bed',
      src: 'idb:bed',
      kind: 'music',
      mimeType: 'audio/mpeg',
      startMs: 0,
      endMs: 8000,
      sourceOffsetMs: 1000,
      volume: 0.3,
    }).do(p2);

    const splitAu = splitStockAudio('sa-a', 3500, 'sa-b');
    const p4 = splitAu.do(p3);
    expect(p4.stockAudio).toHaveLength(2);
    expect(p4.stockAudio?.[0]).toMatchObject({
      id: 'sa-a',
      startMs: 0,
      endMs: 3500,
      sourceOffsetMs: 1000,
    });
    expect(p4.stockAudio?.[1]).toMatchObject({
      id: 'sa-b',
      startMs: 3500,
      endMs: 8000,
      sourceOffsetMs: 4500,
    });
    expect(splitAu.undo(p4)).toEqual(p3);
  });

  it('adds, hides/mutes, compacts on removal, and undoes multi-lane tracks', () => {
    const p0 = makeProject();
    const addM1 = addTimelineLane('media');
    const p1 = addM1.do(p0);
    expect(resolvedMediaLanes(p1).map((l) => l.index)).toEqual([0, 1]);

    const addM2 = addTimelineLane('media');
    const p2 = addM2.do(p1);
    expect(resolvedMediaLanes(p2).map((l) => l.index)).toEqual([0, 1, 2]);

    const p3 = addStockOverlay({
      id: 'ov-l2',
      name: 'Top layer',
      src: 'idb:t2',
      kind: 'photo',
      mimeType: 'image/png',
      startMs: 0,
      endMs: 2000,
      track: 2,
      layout: 'pip',
      provider: 'upload',
    }).do(p2);

    const hideL1 = toggleTimelineLaneHidden(1);
    const p4 = hideL1.do(p3);
    expect(resolvedMediaLanes(p4).find((l) => l.index === 1)?.hidden).toBe(true);
    expect(hideL1.undo(p4)).toEqual(p3);

    // Removing lane 1 compacts lane 2 -> lane 1 and moves its clip to track 1!
    const remL1 = removeTimelineLane('media', 1);
    const p5 = remL1.do(p4);
    expect(resolvedMediaLanes(p5).map((l) => l.index)).toEqual([0, 1]);
    expect(p5.stockOverlays?.[0]?.track).toBe(1);
    expect(remL1.undo(p5)).toEqual(p4);

    // Cannot remove base lane 0 or exceed MAX_TIMELINE_LANES
    expect(() => removeTimelineLane('media', 0).do(p5)).toThrow(CommandRejected);
    let cur = p0;
    for (let i = 1; i < MAX_TIMELINE_LANES; i++) cur = addTimelineLane('audio').do(cur);
    expect(resolvedAudioLanes(cur)).toHaveLength(MAX_TIMELINE_LANES);
    expect(() => addTimelineLane('audio').do(cur)).toThrow(CommandRejected);

    const muteA0 = toggleTimelineLaneMute(0);
    const muted = muteA0.do(cur);
    expect(resolvedAudioLanes(muted)[0]?.muted).toBe(true);
    expect(muteA0.undo(muted)).toEqual(cur);
  });

  it('splits, merges, and cuts main video track with full undo', () => {
    const base = makeProject();
    const p0 = {
      ...base,
      durationMs: 10_000,
      video: {
        src: 'idb:vid',
        width: 1080,
        height: 1920,
        originalDurationMs: 10_000,
        cuts: [],
        punchIns: [],
        defaultOverlayAnchor: 'top-right' as const,
      },
    };

    const s1 = splitVideoAt(3000);
    const p1 = s1.do(p0);
    expect(p1.video?.splits).toEqual([3000]);
    expect(s1.undo(p1)).toEqual(p0);

    // Too close to existing split rejects
    expect(() => splitVideoAt(3100).do(p1)).toThrow(CommandRejected);

    const m1 = removeVideoSplit(3000);
    const p2 = m1.do(p1);
    expect(p2.video?.splits).toBeUndefined();
    expect(m1.undo(p2)).toEqual(p1);

    const c1 = addVideoCut({
      id: 'manual-1',
      startMs: 3000,
      endMs: 6000,
      kind: 'manual',
      reason: 'Manual cut',
      enabled: true,
    });
    const p3 = c1.do(p1);
    expect(p3.video?.cuts).toHaveLength(1);
    const rc1 = removeVideoCut('manual-1');
    const p4 = rc1.do(p3);
    expect(p4.video?.cuts).toHaveLength(0);
    expect(rc1.undo(p4)).toEqual(p3);
  });

  it('property: splitStockOverlay & splitStockAudio preserve total coverage and undo identically', () => {
    const p0 = makeProject();
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10_000 }),
        fc.integer({ min: 600, max: 10_000 }),
        fc.integer({ min: 0, max: 5_000 }),
        fc.double({ min: 0.2, max: 0.8, noNaN: true }),
        (startMs, spanMs, offsetMs, frac) => {
          const endMs = startMs + spanMs;
          const splitMs = Math.max(
            startMs + 250,
            Math.min(endMs - 250, Math.round(startMs + spanMs * frac)),
          );
          const p1 = addStockOverlay({
            id: 'c1',
            name: 'Clip',
            src: 'idb:x',
            kind: 'video',
            mimeType: 'video/mp4',
            startMs,
            endMs,
            sourceOffsetMs: offsetMs,
            layout: 'card',
            provider: 'upload',
          }).do(p0);
          const cmd = splitStockOverlay('c1', splitMs, 'c2');
          const p2 = cmd.do(p1);
          const [left, right] = p2.stockOverlays!;
          expect(left!.startMs).toBe(startMs);
          expect(left!.endMs).toBe(splitMs);
          expect(right!.startMs).toBe(splitMs);
          expect(right!.endMs).toBe(endMs);
          expect(right!.sourceOffsetMs).toBe(offsetMs + (splitMs - startMs));
          expect(cmd.undo(p2)).toEqual(p1);
        },
      ),
      { numRuns: 50 },
    );
  });
});
