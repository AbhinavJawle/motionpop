import type { Format, StylePack } from '@motionpop/schemas';
import type { z } from 'zod';

export type { Format, StylePack };

/** A ready image for a scene (spec 07 R4): already generated or uploaded, keyed or framed. */
export interface ImageRef {
  /** Data URL in the preview, a relative asset path in the render. */
  src: string;
  width: number;
  height: number;
  /** True: a cutout with transparent background. False: a framed photo. */
  keyed: boolean;
  /** Runtime only: the decoded element (map textures upload it to WebGL). Never serialised. */
  el?: HTMLImageElement;
}

export interface BuildContext {
  /** Container sized to the frame. The component owns its children. */
  root: HTMLElement;
  width: number;
  height: number;
  format: Format;
  /** Full style pack (brand-kit merging lands in spec 14). Tokens only: never hard-code colours, fonts or timings. */
  style: StylePack;
  /** Slot length in ms. */
  durationMs: number;
  /** Offset from slot start where the focal element must land (the spoken word). */
  keyMomentMs: number;
  fps: 30;
  seed: number;
  /** Non-fatal problems (truncation, overflow); collected in `window.__motionpop.warnings`. */
  warn: (message: string) => void;
  /** Ready images by asset id (scenes look up their score's `images[].assetId`). */
  images?: Readonly<Record<string, ImageRef>>;
}

export interface Composition {
  durationMs: number;
  /** Pure: renders the state at `tMs` (slot-local) with no dependency on earlier seeks. */
  seek: (tMs: number) => void;
  dispose: () => void;
  /**
   * Camera scale at `tMs` for compositions that plan their own camera (stage scenes). Without
   * it the runtime applies the style pack's plain push-in.
   */
  camera?: (tMs: number) => number;
}

export interface MotionComponent<P> {
  id: string;
  name: string;
  category: 'data' | 'map' | 'text' | 'callout' | 'brand' | 'transition';
  params: z.ZodType<P>;
  defaults: P;
  durationMs: { min: number; ideal: number; max: number };
  formats: Format[];
  /** Default key moment for these params and slot length (used when no spoken word is linked). */
  keyMomentMs: (p: P, durationMs: number) => number;
  build: (ctx: BuildContext, p: P) => Composition;
}
