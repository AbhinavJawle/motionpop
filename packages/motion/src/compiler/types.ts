import type { Energy, Look, SlotTiming } from '@motionpop/schemas';
import type { Format, ImageRef, StylePack } from '../contract';
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
  /**
   * Scenes and custom graphics: the slot's words, times relative to the slot start. Custom
   * graphics also get the text, so a script can land a beat on a word by name.
   */
  words?: { startMs: number; endMs: number; text?: string }[];
  /**
   * Film beats (spec 07b): the beat stays mounted this long after its slot ends, so it can hand
   * over to the next beat. Its clip is that much longer; the slot's own times never overlap.
   */
  tailMs?: number;
  /** Film beats: during the handover this beat is in front of the next (`out`) or behind it (`in`). */
  over?: 'out' | 'in';
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
  /** Seams between graphics (default on). motion:check turns them off to measure settled layout. */
  seams?: boolean;
  /**
   * Whole-video staging (spec 07c, default on): companions, the climax, sides and the world
   * camera, planned across every slot by the runtime. `false` shows each slot on its own.
   */
  staging?: boolean;
  /**
   * A film (spec 07b): the beats tile the voiceover and carry the picture themselves, so the
   * drifting backdrop is left out and the grain is laid over the graphics as well as under them.
   */
  film?: boolean;
  /** Voiceover URL or relative asset path (e.g. "assets/voice.wav"). */
  voiceSrc?: string;
  /** The mixed effects and music bed (spec 12 §7), already levelled against the voice. */
  bedSrc?: string;
  /** Burned-in captions; absent means none. */
  captions?: CompileCaptions;
  /** Ready images by asset id (data URLs in the preview, relative paths in the render). */
  images?: Record<string, ImageRef>;
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
  seams?: boolean;
  staging?: boolean;
  film?: boolean;
  captions?: CompileCaptions;
  images?: Record<string, ImageRef>;
  slots: CompileSlot[];
}
