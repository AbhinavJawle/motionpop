import { decodeWav16, encodeWav16 } from '@motionpop/motion/sfx';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BED_ASSET, prepareBed } from './bed';
import { defaultProject } from './testing/harness';

async function compDirWithVoice(durationMs: number): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'mp-bed-'));
  await mkdir(join(dir, 'assets'));
  const rate = 48000;
  const voice = new Float32Array(Math.round((durationMs / 1000) * rate));
  for (let i = 0; i < voice.length; i++) voice[i] = 0.3 * Math.sin((2 * Math.PI * 220 * i) / rate);
  await writeFile(join(dir, 'assets', 'voice.wav'), encodeWav16(voice, rate));
  return dir;
}

describe('prepareBed', () => {
  it('writes a bed as long as the video when effects are on', async () => {
    const project = defaultProject();
    const dir = await compDirWithVoice(project.durationMs);
    const src = await prepareBed(project, dir);
    expect(src).toBe(BED_ASSET);
    const bed = decodeWav16(await readFile(join(dir, BED_ASSET)));
    expect(bed).not.toBeNull();
    const ms = ((bed?.samples.length ?? 0) / (bed?.sampleRate ?? 1)) * 1000;
    expect(Math.abs(ms - project.durationMs)).toBeLessThan(50);
    expect(bed?.samples.some((x) => Math.abs(x) > 0.01)).toBe(true);
  });

  it('writes nothing when effects are off and there is no music', async () => {
    const project = {
      ...defaultProject(),
      audio: {
        musicGainDb: -18,
        ducking: true,
        duckDepthDb: 8,
        autoSfx: false,
        sfxGainDb: 0,
        sfxSeed: 0,
      },
    };
    const dir = await compDirWithVoice(project.durationMs);
    expect(await prepareBed(project, dir)).toBeNull();
  });

  it('mixes synthesized music even with effects off', async () => {
    const project = {
      ...defaultProject(),
      audio: {
        musicId: 'calm-pad' as const,
        musicGainDb: -18,
        ducking: true,
        duckDepthDb: 8,
        autoSfx: false,
        sfxGainDb: 0,
        sfxSeed: 0,
      },
    };
    const dir = await compDirWithVoice(project.durationMs);
    expect(await prepareBed(project, dir)).toBe(BED_ASSET);
  });
});
