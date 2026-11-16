import { create } from 'zustand';

/**
 * The open project's loaded voice, for panels outside the timeline (spec 11 §12 Voice panel):
 * peaks for the waveform, whether the audio could be loaded, and a seek into the master clock.
 * Set by the editor screen; UI state only.
 */
export type VoiceLoad = 'loading' | 'ready' | 'elsewhere' | 'error';

interface VoiceState {
  status: VoiceLoad;
  peaks: Float32Array | null;
  bucketMs: number;
  seek: ((ms: number) => void) | null;
}

export const useVoiceState = create<VoiceState>(() => ({
  status: 'loading',
  peaks: null,
  bucketMs: 10,
  seek: null,
}));
