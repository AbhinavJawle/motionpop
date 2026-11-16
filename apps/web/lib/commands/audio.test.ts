import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { AudioSettingSchema, DEFAULT_AUDIO, type AudioSetting } from '@motionpop/schemas';
import { canonical, fromCloud, toCloud } from '../projects/cloud-docs';
import { demoProject } from '../projects/fixture';
import { CommandRejected, setAudio } from './index';
import { projectArb } from './test-support';

// Spec 12 B1: the `audio` project field and `setAudio` (property 10 for setAudio).

const patchArb: fc.Arbitrary<Partial<AudioSetting>> = fc.record(
  {
    musicId: fc.constantFrom('calm-pad', 'steady-pulse', 'own', undefined),
    musicSrc: fc.constantFrom('idb:music-1', undefined),
    musicName: fc.string({ maxLength: 80 }),
    musicGainDb: fc.integer({ min: -40, max: 0 }),
    ducking: fc.boolean(),
    duckDepthDb: fc.integer({ min: 0, max: 24 }),
    autoSfx: fc.boolean(),
    sfxGainDb: fc.integer({ min: -24, max: 6 }),
    sfxSeed: fc.nat(),
  },
  { requiredKeys: [] },
);

const startAudioArb = fc.option(
  patchArb.map((x) =>
    AudioSettingSchema.parse(
      Object.fromEntries(Object.entries(x).filter(([, v]) => v !== undefined)),
    ),
  ),
  { nil: undefined },
);

describe('setAudio', () => {
  it('property: undo(do(s)) == s, with or without audio on the project', () => {
    fc.assert(
      fc.property(projectArb, startAudioArb, patchArb, (base, audio, patch) => {
        const s = audio ? { ...base, audio } : base;
        const before = structuredClone(s);
        const cmd = setAudio(patch);
        const next = cmd.do(s);
        expect(s).toEqual(before);
        expect(AudioSettingSchema.safeParse(next.audio).success).toBe(true);
        expect({ ...next, audio: null }).toEqual({ ...before, audio: null }); // only `audio` changes
        expect(cmd.undo(next)).toEqual(before);
      }),
      { numRuns: 300 },
    );
  });

  it('fills defaults on an old project and applies the patch', () => {
    const p = demoProject(1000);
    const next = setAudio({ musicId: 'calm-pad', musicGainDb: -20 }).do(p);
    expect(next.audio).toEqual({ ...DEFAULT_AUDIO, musicId: 'calm-pad', musicGainDb: -20 });
  });

  it('clears a key set to undefined', () => {
    const p = {
      ...demoProject(1000),
      audio: { ...DEFAULT_AUDIO, musicId: 'steady-pulse' as const },
    };
    const next = setAudio({ musicId: undefined }).do(p);
    expect(next.audio).toEqual(DEFAULT_AUDIO);
    expect(next.audio && 'musicId' in next.audio).toBe(false);
  });

  it('rejects out-of-range levels', () => {
    const p = demoProject(1000);
    expect(() => setAudio({ musicGainDb: 5 }).do(p)).toThrow(CommandRejected);
    expect(() => setAudio({ sfxGainDb: -30 }).do(p)).toThrow(CommandRejected);
  });

  it('a project with audio set round-trips through the cloud docs (spec 11)', () => {
    const p = setAudio({
      musicId: 'own',
      musicSrc: 'idb:music-abc',
      musicName: 'My track',
      ducking: false,
      sfxSeed: 3,
    }).do(demoProject(1000));
    const set = toCloud(p, 'u1');
    const r = fromCloud(set.project, set.subs);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(canonical(r.project)).toBe(canonical({ ...p, ownerId: 'u1' }));
      expect(r.project.audio?.musicName).toBe('My track');
    }
  });
});
