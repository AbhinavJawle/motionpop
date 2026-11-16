/// <reference lib="webworker" />
import {
  buildBed,
  encodeWav16,
  MUSIC_BED_IDS,
  SFX_SAMPLE_RATE,
  synthBed,
} from '@motionpop/motion/sfx';
import { BedRequestSchema, type BedResponse } from '../lib/sound/bed-messages';

/** The sound bed off the main thread (spec 12 task B6): effects, music, ducking, limiter. */
declare const self: DedicatedWorkerGlobalScope;

const isSynth = (id: string): id is (typeof MUSIC_BED_IDS)[number] =>
  (MUSIC_BED_IDS as readonly string[]).includes(id);

self.addEventListener('message', (event: MessageEvent<unknown>) => {
  const parsed = BedRequestSchema.safeParse(event.data);
  if (!parsed.success) {
    const id =
      typeof event.data === 'object' && event.data !== null && 'id' in event.data
        ? String((event.data as { id: unknown }).id)
        : 'unknown';
    const msg: BedResponse = { type: 'error', id, message: `bad request: ${parsed.error.message}` };
    self.postMessage(msg);
    return;
  }
  const req = parsed.data;
  try {
    const m = req.music;
    const samples = m
      ? (m.samples ?? (isSynth(m.id) ? synthBed(m.id, req.project.durationMs, 0) : undefined))
      : undefined;
    const bed = buildBed({
      project: req.project,
      voiceSrc: req.voiceSrc,
      voiceLevelDb: req.voiceLevelDb,
      music: m && samples ? { id: m.id, src: m.src, samples } : null,
    });
    if (!bed) {
      const msg: BedResponse = { type: 'none', id: req.id };
      self.postMessage(msg);
      return;
    }
    const wav = encodeWav16(bed.samples, SFX_SAMPLE_RATE);
    const msg: BedResponse = {
      type: 'bed',
      id: req.id,
      key: bed.key,
      wav,
      placements: bed.placements,
      peakDb: bed.peakDb,
    };
    self.postMessage(msg, [wav.buffer]);
  } catch (err) {
    const msg: BedResponse = {
      type: 'error',
      id: req.id,
      message: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(msg);
  }
});
