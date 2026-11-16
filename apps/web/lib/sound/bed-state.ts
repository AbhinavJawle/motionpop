import { create } from 'zustand';
import type { BedPlacement } from './bed-messages';

/**
 * The open project's current sound bed (spec 12 §7): what the timeline's AUDIO track draws and
 * what the bed player plays. UI state only; the project stores the settings, not the mix.
 */
interface BedState {
  status: 'idle' | 'mixing' | 'ready' | 'none' | 'error';
  key: string | null;
  url: string | null;
  /** The mixed WAV, kept for the export upload (same bytes as the preview). */
  wav: Uint8Array | null;
  placements: BedPlacement[];
  /** Measured once per voiceover, in dBFS. */
  voiceLevelDb: number | null;
}

export const useBedState = create<BedState>(() => ({
  status: 'idle',
  key: null,
  url: null,
  wav: null,
  placements: [],
  voiceLevelDb: null,
}));
