import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  addStockAudio,
  addStockOverlay,
  removeStockAudio,
  removeStockOverlay,
  updateStockAudio,
  updateStockOverlay,
} from './stock';
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
});
