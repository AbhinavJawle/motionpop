// Spec 39 R7.2 (review 15): the reel's sound bed in the editor preview and in the export come
// from the one shared `reelBedSound`. Both call sites run over the same project and must write
// the same samples; the three switches (effects, music level, generated track) are pinned.
import { SFX_SAMPLE_RATE, decodeWav16, encodeWav16, voiceLevelDb } from '@motionpop/motion/sfx';
import { fixtureProject } from '@motionpop/motion/testing/project-fixture';
import { EditorProjectSchema, reelBedSound, type EditorProject } from '@motionpop/schemas';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// The preview's builder (apps/web/components/editor/reel-preview.tsx calls it).
import { previewReelBed } from '../../../apps/web/lib/sound/reel-bed';
import { BED_ASSET, prepareReelBed } from './bed';

function reelProject(
  audio: Record<string, unknown> | undefined,
  music?: { src: string },
): EditorProject {
  return EditorProjectSchema.parse({
    ...fixtureProject({ slots: [], durationMs: 9_000 }),
    format: '9:16',
    ...(audio ? { audio } : {}),
    reel: {
      v: 1,
      look: 'mono',
      ...(music ? { music: { brief: 'Calm and warm', ...music } } : {}),
      scenes: [
        {
          id: 'r1',
          startMs: 0,
          endMs: 4_000,
          layout: 'split',
          content: { template: 'headline', title: 'Finish what you start' },
        },
        {
          id: 'r2',
          startMs: 4_000,
          endMs: 9_000,
          layout: 'split',
          content: { template: 'counter', value: 40, suffix: '%', label: 'faster' },
        },
      ],
    },
  });
}

async function compDirWithVoice(durationMs: number): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'mp-reel-bed-'));
  await mkdir(join(dir, 'assets'));
  const rate = 48000;
  const voice = new Float32Array(Math.round((durationMs / 1000) * rate));
  for (let i = 0; i < voice.length; i++) voice[i] = 0.3 * Math.sin((2 * Math.PI * 220 * i) / rate);
  await writeFile(join(dir, 'assets', 'voice.wav'), encodeWav16(voice, rate));
  return dir;
}

/** What the editor preview plays (reel-preview.tsx: sound as JSON, then `previewReelBed`). */
async function previewSamples(project: EditorProject, dir: string): Promise<Float32Array> {
  const voice = decodeWav16(await readFile(join(dir, 'assets', 'voice.wav')))!;
  const level = voiceLevelDb(voice.samples, voice.sampleRate, project.transcript.words);
  const sound = JSON.parse(JSON.stringify(reelBedSound(project))) as ReturnType<
    typeof reelBedSound
  >;
  const samples = previewReelBed(
    project.reel!,
    project.durationMs,
    level,
    project.transcript.words,
    sound,
  );
  return decodeWav16(encodeWav16(samples, SFX_SAMPLE_RATE))!.samples;
}

async function exportSamples(project: EditorProject, dir: string): Promise<Float32Array> {
  expect(await prepareReelBed(project, dir)).toBe(BED_ASSET);
  return decodeWav16(await readFile(join(dir, BED_ASSET)))!.samples;
}

const base = { ducking: true, duckDepthDb: 8, sfxGainDb: 0, sfxSeed: 0 };

describe('reel bed: preview and export parity (spec 39 R7.2)', () => {
  it('effects off, music level -18 and a generated track: both write the same silent bed', async () => {
    const project = reelProject(
      { ...base, musicId: 'calm-pad', musicGainDb: -18, autoSfx: false },
      { src: 'users/u/music/m.wav' },
    );
    // The generated track replaces the synth music, and off means no effects.
    expect(reelBedSound(project)).toEqual({ sfx: false, sfxGainDb: 0, music: null });
    const dir = await compDirWithVoice(project.durationMs);
    const preview = await previewSamples(project, dir);
    const exported = await exportSamples(project, dir);
    expect(exported).toEqual(preview);
    expect(exported.every((x) => x === 0)).toBe(true);
  });

  it('effects on with synth music at -18: same samples, with sound in them', async () => {
    const project = reelProject({
      ...base,
      musicId: 'steady-pulse',
      musicGainDb: -18,
      autoSfx: true,
    });
    expect(reelBedSound(project)).toEqual({
      sfx: true,
      sfxGainDb: 0,
      music: 'steady-pulse',
      musicGainDb: -18,
    });
    const dir = await compDirWithVoice(project.durationMs);
    const preview = await previewSamples(project, dir);
    const exported = await exportSamples(project, dir);
    expect(exported).toEqual(preview);
    expect(exported.some((x) => Math.abs(x) > 0.001)).toBe(true);
  });

  it('a reel with no audio settings (saved before spec 12) matches too', async () => {
    const project = reelProject(undefined);
    const dir = await compDirWithVoice(project.durationMs);
    expect(await exportSamples(project, dir)).toEqual(await previewSamples(project, dir));
  });
});
