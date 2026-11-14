import type { Transition } from 'motion/react';

/**
 * UI motion presets (design-system.md → "UI motion"). UI only: never used inside video compositions.
 * Looping presets (breathe, float, shimmer) must be gated with `useReducedMotion()` by the caller.
 */

export const easeOutSoft = [0.22, 1, 0.36, 1] as const;

export const spring = { type: 'spring', stiffness: 400, damping: 30 } as const satisfies Transition;
export const springPop = {
  type: 'spring',
  stiffness: 500,
  damping: 22,
} as const satisfies Transition;
export const springSoft = {
  type: 'spring',
  stiffness: 220,
  damping: 26,
} as const satisfies Transition;

export const press = { whileTap: { scale: 0.97 }, transition: spring } as const;
export const hoverLift = { whileHover: { y: -1 }, transition: spring } as const;
/** Press + lift together, the default for every button. */
export const buttonMotion = {
  whileHover: { y: -1 },
  whileTap: { scale: 0.97 },
  transition: spring,
} as const;

export const popIn = {
  initial: { scale: 0.9, opacity: 0 },
  animate: { scale: 1, opacity: 1 },
  exit: { scale: 0.9, opacity: 0 },
  transition: springPop,
} as const;

export const fadeIn = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.2, ease: easeOutSoft },
} as const;

export const panelSlide = {
  initial: { x: -16, opacity: 0 },
  animate: { x: 0, opacity: 1 },
  exit: { x: -16, opacity: 0 },
  transition: { duration: 0.24, ease: easeOutSoft },
} as const;

export const modal = {
  initial: { scale: 0.96, opacity: 0 },
  animate: { scale: 1, opacity: 1 },
  exit: { scale: 0.96, opacity: 0 },
  transition: spring,
} as const;

export const toast = {
  initial: { y: 16, opacity: 0 },
  animate: { y: 0, opacity: 1 },
  exit: { y: 8, opacity: 0 },
  transition: springPop,
} as const;

/** Slow glow for suggested slots. Loop: gate with reduced motion. */
export const breathe = {
  animate: { opacity: [0.55, 1, 0.55] },
  transition: { duration: 2.8, ease: 'easeInOut', repeat: Infinity },
} as const;

/** Pip's idle float. Loop: gate with reduced motion. */
export const float = {
  animate: { y: [0, -4, 0] },
  transition: { duration: 3.2, ease: 'easeInOut', repeat: Infinity },
} as const;

/** Diagonal sweep for generating states (animate `backgroundPositionX`). Loop: gate with reduced motion. */
export const shimmer = {
  animate: { backgroundPositionX: ['-150%', '250%'] },
  transition: { duration: 1.6, ease: 'linear', repeat: Infinity },
} as const;

/** Stagger children by `step` seconds (lists, chips appearing). */
export const stagger = (step = 0.04) =>
  ({ animate: { transition: { staggerChildren: step } } }) as const;
