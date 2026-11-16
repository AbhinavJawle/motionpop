import { timingDefaultsFor } from '@motionpop/ai';
import { eases, looks, stylePacks } from '@motionpop/motion';
import type { Look, SlotTiming, StylePack } from '@motionpop/schemas';

/** The ease choices of the TIMING row (spec 09 R4.2, D-040). */
export type EaseChoice = NonNullable<SlotTiming['ease']>;

export const EASE_LABELS: Record<EaseChoice, string> = {
  inOut: 'Ease in-out',
  out: 'Ease out',
  linear: 'Linear',
};

/** What the curve of each choice looks like: the ease the engine maps it to (`runtime/timing.ts`). */
const CURVE_EASE = { inOut: 'inOutCubic', out: 'outExpo', linear: 'linear' } as const;

/** The ease a slot plays with: its own, else the look's (`timingDefaultsFor`). */
export function effectiveEase(
  timing: SlotTiming | undefined,
  look: { motion: { moveEase: string } },
): EaseChoice {
  return timing?.ease ?? timingDefaultsFor({ moveEase: look.motion.moveEase }).ease;
}

/** The SVG path of an ease curve in a `width × height` box with `pad` px around it (y grows downwards). */
export function easeCurvePath(choice: EaseChoice, width = 30, height = 16, pad = 1): string {
  const f = eases[CURVE_EASE[choice]];
  const steps = 24;
  const points: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const x = i / steps;
    const px = pad + x * (width - 2 * pad);
    const py = height - pad - f(x) * (height - 2 * pad);
    points.push(`${i === 0 ? 'M' : 'L'}${px.toFixed(2)} ${py.toFixed(2)}`);
  }
  return points.join(' ');
}

/** The patch for `setSlotTiming` when the Fade switch moves: the default (on) is stored as "unset". */
export function fadePatch(on: boolean): { fade: boolean | undefined } {
  return { fade: on ? undefined : false };
}

/** The looks a creator can pick for the whole video (D-036): the packs we ship, then the polished looks. */
export function styleOptions(): (StylePack | Look)[] {
  const seen = new Set<string>();
  const out: (StylePack | Look)[] = [];
  for (const s of [...Object.values(stylePacks), ...Object.values(looks)]) {
    if (!seen.has(s.id)) {
      seen.add(s.id);
      out.push(s);
    }
  }
  return out;
}
