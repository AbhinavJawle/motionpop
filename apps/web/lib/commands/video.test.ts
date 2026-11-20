import type { EditorProject } from '@motionpop/schemas';
import { describe, expect, it } from 'vitest';
import {
  addVideoCut,
  addVideoPunchIn,
  removeVideoPunchIn,
  setAllSlotsPlacement,
  setAllVideoCutsEnabled,
  setSlotPlacement,
  toggleVideoCut,
} from './video';

function sampleVideoProject(): EditorProject {
  return {
    schemaVersion: 1,
    id: 'p-1',
    title: 'Test video',
    format: '16:9',
    fps: 30,
    styleId: 'editorial-explainer',
    durationMs: 10000,
    voiceover: { src: 'idb:voice', durationMs: 10000 },
    video: {
      src: 'idb:video',
      width: 1920,
      height: 1080,
      originalDurationMs: 12000,
      cuts: [
        {
          id: 'cut-1',
          startMs: 1000,
          endMs: 2000,
          kind: 'retake',
          reason: 'False start',
          enabled: true,
        },
      ],
      punchIns: [],
      defaultOverlayAnchor: 'top-right',
    },
    transcript: {
      language: 'en',
      ranOn: 'device',
      timingQuality: 'word',
      cleaned: true,
      words: [
        { i: 0, text: 'Hello', startMs: 0, endMs: 400, filler: false, conf: 1 },
        { i: 1, text: 'world', startMs: 500, endMs: 900, filler: false, conf: 1 },
      ],
    },
    slots: [
      {
        id: 's1',
        startMs: 0,
        endMs: 3000,
        wordStart: 0,
        wordEnd: 1,
        reason: 'hook',
        componentId: 'big-number',
        skillId: 'stat',
        prompt: '',
        params: { value: 42 },
        status: 'ready',
        notes: [],
        placement: 'overlay',
        overlayAnchor: 'top-right',
      },
    ],
    versions: [],
    createdAt: 1,
    updatedAt: 1,
  };
}

describe('video commands (spec 18)', () => {
  it('toggles slot placement and anchor with exact undo', () => {
    const p0 = sampleVideoProject();
    const cmd = setSlotPlacement('s1', 'cutaway');
    const p1 = cmd.do(p0);
    expect(p1.slots[0]?.placement).toBe('cutaway');
    expect(p1.slots[0]?.overlayAnchor).toBeUndefined();

    const p2 = cmd.undo(p1);
    expect(p2.slots[0]?.placement).toBe('overlay');
    expect(p2.slots[0]?.overlayAnchor).toBe('top-right');
  });

  it('switches all slots placement with exact undo', () => {
    const p0 = sampleVideoProject();
    const cmd = setAllSlotsPlacement('cutaway');
    const p1 = cmd.do(p0);
    expect(p1.slots[0]?.placement).toBe('cutaway');
    expect(cmd.undo(p1).slots[0]?.placement).toBe('overlay');
  });

  it('toggles, enables/disables, and adds video cuts with exact undo', () => {
    const p0 = sampleVideoProject();
    const t = toggleVideoCut('cut-1');
    const p1 = t.do(p0);
    expect(p1.video?.cuts[0]?.enabled).toBe(false);
    expect(t.undo(p1).video?.cuts[0]?.enabled).toBe(true);

    const allOff = setAllVideoCutsEnabled(false);
    const p2 = allOff.do(p0);
    expect(p2.video?.cuts[0]?.enabled).toBe(false);
    expect(allOff.undo(p2).video?.cuts[0]?.enabled).toBe(true);

    const add = addVideoCut({
      id: 'cut-2',
      startMs: 3000,
      endMs: 4000,
      kind: 'manual',
      reason: 'Trim pause',
      enabled: true,
    });
    const p3 = add.do(p0);
    expect(p3.video?.cuts).toHaveLength(2);
    expect(add.undo(p3).video?.cuts).toHaveLength(1);
  });

  it('adds and removes punch-ins with exact undo', () => {
    const p0 = sampleVideoProject();
    const add = addVideoPunchIn({
      id: 'punch-1',
      startMs: 1000,
      endMs: 3500,
      scale: 1.18,
      focusX: 0.5,
      focusY: 0.35,
      reason: 'Key point',
    });
    const p1 = add.do(p0);
    expect(p1.video?.punchIns).toHaveLength(1);
    expect(add.undo(p1).video?.punchIns).toHaveLength(0);

    const rm = removeVideoPunchIn('punch-1');
    const p2 = rm.do(p1);
    expect(p2.video?.punchIns).toHaveLength(0);
    expect(rm.undo(p2).video?.punchIns).toHaveLength(1);
  });
});
