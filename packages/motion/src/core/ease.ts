/**
 * Easing functions: pure maps from progress [0, 1] to eased progress.
 * Every ease returns exactly 0 at 0 and exactly 1 at 1 (property-tested).
 */
export type Ease = (x: number) => number;

const clamp01 = (x: number): number => (x <= 0 ? 0 : x >= 1 ? 1 : x);

export const linear: Ease = (x) => clamp01(x);

export const outCubic: Ease = (x) => {
  const t = clamp01(x);
  return 1 - (1 - t) ** 3;
};

export const outQuart: Ease = (x) => {
  const t = clamp01(x);
  return 1 - (1 - t) ** 4;
};

/** Decisive entrance ease. Normalised so outExpo(1) is exactly 1. */
export const outExpo: Ease = (x) => {
  const t = clamp01(x);
  if (t === 0) return 0;
  if (t === 1) return 1;
  return (1 - 2 ** (-10 * t)) / (1 - 2 ** -10);
};

export const inOutCubic: Ease = (x) => {
  const t = clamp01(x);
  return t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
};

export const inOutSine: Ease = (x) => -(Math.cos(Math.PI * clamp01(x)) - 1) / 2;

export const eases = { linear, outCubic, outQuart, outExpo, inOutCubic, inOutSine } as const;
export type EaseName = keyof typeof eases;
