import type { Word } from '@motionpop/schemas';
import { SYNTH_SAMPLE_RATE, synthVoice } from '../audio/synth-voice';
import { encodeWav } from '../audio/wav';
import { demoWords } from '../projects/fixture';

/** Demo voiceover length (matches the fixture). */
const SAMPLE_DURATION_MS = 18_000;

export interface SampleInput {
  file: Blob;
  name: string;
  /**
   * Words to use instead of transcribing. The sample voice is synthesized, and Whisper can't
   * recognise a synthetic buzz, so the fixture words are used and labelled "Sample transcript"
   * (D-024). When a real recorded sample is bundled, this goes away and it is transcribed.
   */
  words: Word[];
}

/** "Try a sample" (spec 05 R1.4): our own synthesized voice, no third-party audio. */
export function sampleInput(): SampleInput {
  const samples = synthVoice(demoWords, SAMPLE_DURATION_MS, 1, SYNTH_SAMPLE_RATE);
  return {
    file: new Blob([encodeWav(samples, SYNTH_SAMPLE_RATE)], { type: 'audio/wav' }),
    name: 'Sample voiceover',
    words: demoWords.map((w) => ({ ...w })),
  };
}
