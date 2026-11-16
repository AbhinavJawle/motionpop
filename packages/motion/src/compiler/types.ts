import type { Energy, Look, SlotTiming } from '@motionpop/schemas';
import type { Format, StylePack } from '../contract';
import type { CaptionGroup, CaptionPresetId } from '../captions/chunk';

/** Captions for the overlay (spec 12 R4–R5); groups come from `chunkCaptions`, never stored. */
export interface CompileCaptions {
  presetId: CaptionPresetId;
  groups: CaptionGroup[];
}

/** What the compiler needs from a project. Integer milliseconds everywhere. */
export interface CompileSlot {
  id: string;
  startMs: number;
  endMs: number;
  componentId: string;
  params: unknown;
  /** Slot-local key moment (spoken word); defaults to the component's own. */
  keyMomentMs?: number;
  /** Scenes only: the slot's words, times relative to the slot start. */
  words?: { startMs: number; endMs: number }[];
  /** Scenes only: prosody stress per slot word (0–100). */
  stress?: number[];
  /** Scenes only: pauses in the delivery, relative to the slot start. */
  pauses?: { startMs: number; endMs: number }[];
  /** Scenes only: this slot's energy from the director (spec 07 R6.1); else the project's. */
  energy?: Energy;
  /**
   * The slot's timing overrides (spec 09): `speed` and `ease` change how this clip moves, `fade:
   * false` makes a scene hold its last frame instead of playing its exit. Library components
   * ignore `fade`.
   */
  timing?: SlotTiming;
}

export interface CompileInput {
  /** Frame size comes from `FORMATS[format]` (packages/schemas). */
  format: Format;
  durationMs: number;
  /** A style pack, or a look (a style pack with the spec 07 craft blocks). */
  style: StylePack | Look;
  /** Beat energy for scenes; defaults to the look's. */
  energy?: Energy;
  /** `transparent` omits the background and texture layers (WebM overlay export). Default `style`. */
  background?: 'style' | 'transparent';
  /** `preview` draws a placeholder for a failed slot; `render` leaves it empty so the job can fail. Default preview. */
  mode?: 'preview' | 'render';
  /** Voiceover URL or relative asset path (e.g. "assets/voice.wav"). */
  voiceSrc?: string;
  /** Burned-in captions; absent means none. */
  captions?: CompileCaptions;
  slots: CompileSlot[];
}

/** Payload the browser runtime reads from `window.__MP_PROJECT__`. */
export interface RuntimeProject {
  width: number;
  height: number;
  format: Format;
  durationMs: number;
  /** A style pack, or a look (a style pack with the spec 07 craft blocks). */
  style: StylePack | Look;
  /** Beat energy for scenes; defaults to the look's. */
  energy?: Energy;
  mode?: 'preview' | 'render';
  captions?: CompileCaptions;
  slots: CompileSlot[];
}
