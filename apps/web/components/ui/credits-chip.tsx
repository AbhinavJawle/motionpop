'use client';

import { Zap } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '@/lib/cn';
import { buttonMotion } from '@/lib/motion/presets';
import { NumberRoll } from './number-roll';

/**
 * "120 credits" (design/figma-export.css l.540): 70×32, card bg, glass shadow, r10;
 * ⚡ 14px ember + Geist Mono 12px balance that rolls when it changes.
 */
export function CreditsChip({
  credits,
  onClick,
  className,
}: {
  credits: number;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      {...buttonMotion}
      aria-label={`${credits} credits`}
      className={cn(
        'inline-flex h-8 min-w-[70px] items-center justify-center gap-2 rounded-chip bg-card px-3 text-xs leading-4 text-text shadow-glass hover:bg-card-2',
        className,
      )}
    >
      <Zap className="size-3.5 text-ember" strokeWidth={1.5} aria-hidden />
      <NumberRoll value={credits} aria-label={`${credits}`} />
    </motion.button>
  );
}
