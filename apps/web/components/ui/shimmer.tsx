'use client';

import { motion } from 'motion/react';
import { cn } from '@/lib/cn';
import { useStill } from '@/lib/motion/use-still';

/**
 * Diagonal sweep for generating states (slot cards, thumbnails). Place inside a `relative` parent.
 * Reduced motion: a faint static tint instead of the sweep.
 */
export function Shimmer({
  tone = 'violet',
  className,
}: {
  tone?: 'violet' | 'neutral';
  className?: string;
}) {
  const still = useStill();
  const color = tone === 'violet' ? 'rgb(139 124 255 / 0.18)' : 'rgb(255 255 255 / 0.07)';
  return (
    <motion.span
      aria-hidden
      className={cn(
        'pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]',
        className,
      )}
      style={{
        backgroundImage: `linear-gradient(110deg, transparent 30%, ${color} 50%, transparent 70%)`,
        backgroundSize: '250% 100%',
        backgroundRepeat: 'no-repeat',
      }}
      initial={false}
      animate={still ? { backgroundPositionX: '50%' } : { backgroundPositionX: ['150%', '-50%'] }}
      transition={still ? { duration: 0 } : { duration: 1.6, ease: 'linear', repeat: Infinity }}
    />
  );
}
