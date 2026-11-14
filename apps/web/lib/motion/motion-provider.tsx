'use client';

import { MotionConfig } from 'motion/react';
import type { ReactNode } from 'react';

/**
 * Honours the OS "reduce motion" setting for every `motion` component: transforms and layout animations
 * become instant, opacity/colour still fade. Looping presets are additionally gated with `useReducedMotion()`.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
