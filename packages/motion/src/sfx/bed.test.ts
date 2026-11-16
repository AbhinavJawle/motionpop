import { DEFAULT_AUDIO } from '@motionpop/schemas';
import { describe, expect, it } from 'vitest';
import { buildBed, planBed, bedKeyMoment, type BedProject, type BedSlot } from './bed';
import { synthBed } from './music';

const words = Array.from({ length: 20 }, (_, i) => ({ startMs: i * 400, endMs: i * 400 + 320 }));
const slot = (over: Partial<BedSlot> = {}): BedSlot => ({
  id: 's1',
  startMs: 1000,
  endMs: 5000,
  wordStart: 2,
  wordEnd: 12,
  componentId: 'stat-punch',
  status: 'ready',
  params: {
    content: { value: 40, suffix: '%', label: 'growth' },
    beats: [{ cue: 'number', word: 3 }],
  },
  ...over,
});
const project = (over: Partial<BedProject> = {}): BedProject => ({
  durationMs: 8000,
  slots: [slot()],
  transcript: { words },
  audio: DEFAULT_AUDIO,
  ...over,
});

describe('bed', () => {
  it('lands a scene effect on its focal word', () => {
    // word 2 + 3 = word 5 starts at 2000 ms, so 1000 ms into the slot.
    expect(bedKeyMoment(slot(), project())).toBe(1000);
  });

  it('mixes effects into a limited bed of the video length, with a stable key', () => {
    const a = buildBed({ project: project(), voiceSrc: 'v1', voiceLevelDb: -20, music: null });
    const b = buildBed({ project: project(), voiceSrc: 'v1', voiceLevelDb: -20, music: null });
    expect(a).not.toBeNull();
    expect(a?.samples.length).toBe(24_000 * 8);
    expect(a?.peakDb).toBeLessThanOrEqual(-1);
    expect(a?.placements.length).toBeGreaterThan(0);
    expect(a?.key).toBe(b?.key);
    const other = planBed({ project: project(), voiceSrc: 'v2', voiceLevelDb: -20, music: null });
    expect(other?.key).not.toBe(a?.key);
  });

  it('is null with effects off and no music, and keeps music alone', () => {
    const off = project({ audio: { ...DEFAULT_AUDIO, autoSfx: false } });
    expect(planBed({ project: off, voiceSrc: 'v', voiceLevelDb: -20, music: null })).toBeNull();
    const music = { id: 'calm-pad', samples: synthBed('calm-pad', 8000, 1) };
    const withMusic = planBed({ project: off, voiceSrc: 'v', voiceLevelDb: -20, music });
    expect(withMusic?.input.music).not.toBeNull();
    expect(withMusic?.input.envelope).not.toBeNull();
    expect(withMusic?.placements).toEqual([]);
  });
});
