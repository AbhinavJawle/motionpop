import {
  cleanedDurationFromSegments,
  keptSourceSegments,
  type EditorProject,
  type Word,
} from '@motionpop/schemas';
import { appAudioStore } from '@/lib/audio/app-audio-store';
import { decodeForPipeline, OUTPUT_SAMPLE_RATE } from '@/lib/audio/decode';
import { retimeWords } from '@/lib/audio/edl';
import { renderCleaned } from '@/lib/audio/render-cleaned';
import { encodeWav } from '@/lib/audio/wav';

export interface ResplicedAudioResult {
  voiceSrc: string;
  durationMs: number;
  words: Word[];
  hasCuts: boolean;
}

/**
 * Re-splices the cleaned voiceover WAV live from `voiceover.originalSrc` whenever the creator
 * toggles a video cut on or off after processing (spec 21 R4.1), keeping voice audio, captions,
 * and `<video>` cuts 100% frame-locked.
 */
export async function respliceProjectAudio(
  project: EditorProject,
): Promise<ResplicedAudioResult | null> {
  const video = project.video;
  const origSrc = project.voiceover.originalSrc ?? video?.src;
  if (!video || !origSrc) return null;

  const store = appAudioStore();
  const origBlob = await store.get(origSrc).catch(() => null);
  if (!origBlob) return null;

  const enabledCuts = video.cuts
    .filter((c) => c.enabled)
    .map((c) => ({ startMs: c.startMs, endMs: c.endMs }));
  const segments = keptSourceSegments(video.originalDurationMs, video.cuts);
  const nextDurationMs = Math.max(100, cleanedDurationFromSegments(segments));

  const origWords = project.originalTranscript?.words ?? project.transcript.words;
  const retimedWords = retimeWords(origWords, enabledCuts);

  if (enabledCuts.length === 0) {
    return {
      voiceSrc: origSrc,
      durationMs: project.voiceover.originalDurationMs ?? video.originalDurationMs,
      words: retimedWords,
      hasCuts: false,
    };
  }

  const decoded = await decodeForPipeline(origBlob);
  const cleanedPcm = await renderCleaned(decoded.pcm24k, OUTPUT_SAMPLE_RATE, enabledCuts);
  const wavBlob = new Blob([encodeWav(cleanedPcm, OUTPUT_SAMPLE_RATE)], { type: 'audio/wav' });
  const voiceSrc = await store.put(wavBlob, { projectId: project.id, kind: 'voice' });

  return {
    voiceSrc,
    durationMs: nextDurationMs,
    words: retimedWords,
    hasCuts: true,
  };
}
