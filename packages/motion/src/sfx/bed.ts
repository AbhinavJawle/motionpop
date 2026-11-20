// One bed for a project (spec 12 §7): effects placed on the graphics, optional music ducked under
// the voice, mixed and limited. The editor preview (worker) and the export upload both call this,
// so they hear the same bytes.
import { audioOf, type AudioSetting } from '@motionpop/schemas';
import { keyMomentAbsMs } from '../compiler/key-moment';
import type { CompileSlot } from '../compiler/types';
import { sceneFor } from '../registry';
import { SFX_SAMPLE_RATE } from './dsp';
import { duckEnvelope } from './duck';
import { rmsDb } from './level';
import { bedKey, mixBed, type BedInput } from './mix';
import { placeSfx, type SfxPlacement, type SfxSlot } from './place';

/** The slot fields the bed reads (an `EditorProject` slot fits). */
export interface BedSlot extends SfxSlot {
  params: unknown;
  keyMomentMs?: number | undefined;
}

/** The project fields the bed reads (an `EditorProject` fits). */
export interface BedProject<S extends BedSlot = BedSlot> {
  durationMs: number;
  slots: readonly S[];
  transcript: {
    words: ReadonlyArray<{ startMs: number; endMs: number; filler?: boolean | undefined }>;
  };
  audio?: AudioSetting | undefined;
  video?: { stages?: ReadonlyArray<{ id: string; startMs: number; endMs: number; mode: string }> };
}

/** Music already decoded at 24 kHz mono, fitted to the video (or a loop the mixer fits). */
export interface BedMusic {
  /** `calm-pad`, `steady-pulse` or `own`. */
  id: string;
  /** The own track's AudioStore ref (part of the key). */
  src?: string | undefined;
  samples: Float32Array;
}

export interface BedPlan {
  input: BedInput;
  key: string;
  placements: SfxPlacement[];
}

/**
 * Slot-relative key moment for effect placement: a scene's focal beat lands on its spoken word;
 * other graphics use the compiler's key moment (the same one the thumbnail uses).
 */
export function bedKeyMoment<S extends BedSlot>(slot: S, project: BedProject<S>): number {
  const scene = sceneFor(slot.componentId);
  const beats = (slot.params as { beats?: unknown } | null)?.beats;
  if (scene && Array.isArray(beats)) {
    const beat = beats.find(
      (b): b is { cue: string; word: number } =>
        !!b && typeof b === 'object' && (b as { cue?: unknown }).cue === scene.focalCue,
    );
    const word = beat ? project.transcript.words[slot.wordStart + beat.word] : undefined;
    if (word && word.startMs >= slot.startMs && word.startMs <= slot.endMs)
      return word.startMs - slot.startMs;
  }
  const compile: CompileSlot = {
    id: slot.id,
    startMs: slot.startMs,
    endMs: slot.endMs,
    componentId: slot.componentId,
    params: slot.params,
    ...(slot.keyMomentMs !== undefined ? { keyMomentMs: slot.keyMomentMs } : {}),
  };
  return keyMomentAbsMs(compile) - slot.startMs;
}

/**
 * The bed's inputs and key, or null when there is nothing to mix (effects off or none placed,
 * and no music). `voiceLevelDb` is measured once per voiceover (`voiceLevelDb()` in level.ts).
 */
export function planBed<S extends BedSlot>(args: {
  project: BedProject<S>;
  voiceSrc: string;
  voiceLevelDb: number;
  music: BedMusic | null;
}): BedPlan | null {
  const { project, music } = args;
  const audio = audioOf(project);
  const placements = placeSfx(project, (s) => bedKeyMoment(s, project), audio.sfxSeed);
  if (placements.length === 0 && !music) return null;
  const envelope =
    music && audio.ducking
      ? duckEnvelope(project.transcript.words, project.durationMs, { depthDb: audio.duckDepthDb })
      : null;
  const sfx = placements.map(({ kind, take, atMs, gainDb }) => ({ kind, take, atMs, gainDb }));
  const input: BedInput = {
    durationMs: project.durationMs,
    sampleRate: SFX_SAMPLE_RATE,
    voiceLevelDb: args.voiceLevelDb,
    music: music ? { samples: music.samples, levelDb: rmsDb(music.samples) } : null,
    musicGainDb: audio.musicGainDb,
    ducking: audio.ducking,
    duckDepthDb: audio.duckDepthDb,
    envelope,
    sfx,
    sfxGainDb: audio.sfxGainDb,
  };
  const key = bedKey({
    durationMs: input.durationMs,
    voiceSrc: args.voiceSrc,
    voiceLevelDb: input.voiceLevelDb,
    music: music ? { id: music.id, src: music.src } : null,
    musicGainDb: input.musicGainDb,
    ducking: input.ducking,
    duckDepthDb: input.duckDepthDb,
    envelope,
    sfx,
    sfxGainDb: input.sfxGainDb,
  });
  return { input, key, placements };
}

/** Plans and mixes in one go. */
export function buildBed<S extends BedSlot>(
  args: Parameters<typeof planBed<S>>[0],
): (BedPlan & { samples: Float32Array; peakDb: number }) | null {
  const plan = planBed(args);
  if (!plan) return null;
  const { samples, peakDb } = mixBed(plan.input);
  return { ...plan, samples, peakDb };
}
