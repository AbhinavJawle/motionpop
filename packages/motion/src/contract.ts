import type { Format, StylePack } from '@motionpop/schemas';
import type { z } from 'zod';

export type { Format, StylePack };

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
}

export interface Composition {
  durationMs: number;
  /** Pure: renders the state at `tMs` (slot-local) with no dependency on earlier seeks. */
  seek: (tMs: number) => void;
  dispose: () => void;
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
