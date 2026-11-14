import type { Format, StyleTokens } from '../contract';

/** What the compiler needs from a project. Integer milliseconds everywhere. */
export interface CompileSlot {
  id: string;
  startMs: number;
  endMs: number;
  componentId: string;
  params: unknown;
  /** Slot-local key moment (spoken word); defaults to the component's own. */
  keyMomentMs?: number;
}

export interface CompileInput {
  width: number;
  height: number;
  format: Format;
  durationMs: number;
  style: StyleTokens;
  /** Voiceover URL or relative asset path (e.g. "assets/voice.wav"). */
  voiceSrc?: string;
  slots: CompileSlot[];
}

/** Payload the browser runtime reads from `window.__MP_PROJECT__`. */
export type RuntimeProject = Omit<CompileInput, 'voiceSrc'>;
