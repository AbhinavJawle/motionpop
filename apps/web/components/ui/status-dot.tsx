'use client';

import { motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/cn';

const tones = {
  mint: 'bg-mint',
  ember: 'bg-ember',
  violet: 'bg-violet',
  warn: 'bg-warn',
  error: 'bg-error',
  muted: 'bg-text-4',
} as const;

/** Small status dot ("● Ready in 4.2s", "● All changes saved"). `pulse` adds a soft halo while something is live. */
export function StatusDot({
  tone = 'mint',
  pulse = false,
  className,
}: {
  tone?: keyof typeof tones;
  pulse?: boolean;
  className?: string;
}) {
  const reduce = useReducedMotion() ?? false;
  return (
    <span className={cn('relative inline-flex size-1.5 shrink-0', className)} aria-hidden>
      {pulse && (
        // Same element on server and client (avoids a hydration mismatch); only the animation is gated.
        <motion.span
          className={cn('absolute inset-0 rounded-full opacity-0', tones[tone])}
          animate={reduce ? { opacity: 0 } : { scale: [1, 2.4], opacity: [0.5, 0] }}
          transition={
            reduce ? { duration: 0 } : { duration: 1.4, repeat: Infinity, ease: 'easeOut' }
          }
        />
      )}
      <span className={cn('relative size-1.5 rounded-full', tones[tone])} />
    </span>
  );
}
