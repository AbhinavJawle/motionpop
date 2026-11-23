// The sound bed in the export (spec 12 task B8). The job mixes it from the snapshot with the same
// functions the editor's worker uses, so the export carries the effects and music the editor
// played, with nothing extra to upload or trust.
import {
  MUSIC_BED_IDS,
  SFX_SAMPLE_RATE,
  buildBed,
  decodeWav16,
  encodeWav16,
  synthBed,
  voiceLevelDb,
  type BedMusic,
} from '@motionpop/motion/sfx';
import {
  decodeWavStereo16,
  encodeWavStereo16,
  mixReelMusic,
  reelBed,
} from '@motionpop/motion/reel';
import { audioOf, reelBedSound, type EditorProject } from '@motionpop/schemas';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const BED_ASSET = 'assets/bed.wav';

const isSynth = (id: string | undefined): id is (typeof MUSIC_BED_IDS)[number] =>
  !!id && (MUSIC_BED_IDS as readonly string[]).includes(id);

/**
 * Writes `assets/bed.wav` next to the re-encoded voice and returns its path, or null when the
 * project has nothing to mix. An own music track is not in the export yet (it lives only in the
 * owner's browser), so only synthesized music is mixed.
 */
export async function prepareBed(project: EditorProject, compDir: string): Promise<string | null> {
  const audio = audioOf(project);
  const music: BedMusic | null = isSynth(audio.musicId)
    ? { id: audio.musicId, samples: synthBed(audio.musicId, project.durationMs, 0) }
    : null;
  if (!audio.autoSfx && !music) return null;
  const voice = decodeWav16(await readFile(join(compDir, 'assets', 'voice.wav')));
  if (!voice) throw new Error('the re-encoded voice is not a 16-bit WAV');
  const bed = buildBed({
    project,
    voiceSrc: project.voiceover.src,
    voiceLevelDb: voiceLevelDb(voice.samples, voice.sampleRate, project.transcript.words),
    music,
  });
  if (!bed) return null;
  await writeFile(join(compDir, BED_ASSET), encodeWav16(bed.samples, SFX_SAMPLE_RATE));
  return BED_ASSET;
}

/**
 * The reel's sound design (spec 26 R4.1): effects on every reveal from the plan, plus the
 * project's synthesized music when one is chosen, mixed under the re-encoded voice.
 */
export async function prepareReelBed(
  project: EditorProject,
  compDir: string,
): Promise<string | null> {
  if (!project.reel) return null;
  const voice = decodeWav16(await readFile(join(compDir, 'assets', 'voice.wav')));
  if (!voice) throw new Error('the re-encoded voice is not a 16-bit WAV');
  const samples = reelBed(project.reel, project.durationMs, {
    voiceLevelDb: voiceLevelDb(voice.samples, voice.sampleRate, project.transcript.words),
    words: project.transcript.words,
    ...reelBedSound(project),
  });
  await writeFile(join(compDir, BED_ASSET), encodeWav16(samples, SFX_SAMPLE_RATE));
  return BED_ASSET;
}

export const MUSIC_ASSET = 'assets/music.wav';

/**
 * The reel's generated music (spec 27 R3.2), levelled and ducked under the re-encoded voice with
 * the same `mixReelMusic` the editor preview uses. `musicFile` is the downloaded stored music.
 */
export async function prepareReelMusic(
  project: EditorProject,
  compDir: string,
  musicFile: string,
): Promise<string | null> {
  const music = decodeWavStereo16(await readFile(musicFile));
  if (!music) throw new Error('the stored music is not a 16-bit WAV');
  const voice = decodeWav16(await readFile(join(compDir, 'assets', 'voice.wav')));
  if (!voice) throw new Error('the re-encoded voice is not a 16-bit WAV');
  const words = project.transcript.words;
  const mixed = mixReelMusic(music, {
    voiceLevelDb: voiceLevelDb(voice.samples, voice.sampleRate, words),
    words,
  });
  await writeFile(join(compDir, MUSIC_ASSET), encodeWavStereo16(mixed));
  return MUSIC_ASSET;
}
