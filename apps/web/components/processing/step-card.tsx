'use client';

import { motion } from 'motion/react';
import { Cloud, Zap } from 'lucide-react';
import { Shimmer } from '@/components/ui/shimmer';
import { cn } from '@/lib/cn';
import type { StepState } from '@/lib/pipeline/events';
import { popIn } from '@/lib/motion/presets';

/**
 * One step of the Processing screen (spec 35): a numbered line of the shot list. Active is
 * tinted with a shimmer, done gets an ink tick, failed a red mark.
 */
export function StepCard({
  index,
  title,
  state,
  detail,
  route,
}: {
  index: number;
  title: string;
  state: StepState;
  detail?: string;
  /** An AI step's route (hybrid-ai.md: users always see where an action runs). */
  route?: 'device' | 'cloud';
}) {
  return (
    <motion.li
      layout
      {...popIn}
      data-state={state}
      className={cn(
        'relative flex min-h-[64px] items-center overflow-hidden border-b-2 border-ink pr-5 pl-5 transition-colors duration-200 last:border-b-0',
        state === 'active' && 'bg-[#fff1ea]',
        state === 'failed' && 'bg-[#fdecec]',
      )}
    >
      {state === 'active' && <Shimmer tone="neutral" />}
      <span
        aria-hidden
        className={cn(
          'relative w-12 shrink-0 font-poster text-[30px] leading-none tabular',
          (state === 'pending' || state === 'skipped') && 'text-black/30',
        )}
      >
        {String(index).padStart(2, '0')}
      </span>
      <span
        className={cn(
          'relative text-[15px] font-semibold',
          (state === 'pending' || state === 'skipped') && 'font-normal text-black/45',
        )}
      >
        {title}
        {state === 'active' && '…'}
      </span>
      <span className="relative ml-auto flex items-center gap-3 pl-4">
        {detail && state !== 'skipped' && (
          <motion.span
            key={detail}
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
              'hidden max-w-[300px] truncate text-[12px] sm:block',
              state === 'failed' ? 'text-error' : 'text-black/60',
            )}
          >
            {detail}
          </motion.span>
        )}
        {route && state !== 'skipped' && state !== 'pending' && (
          <span className="inline-flex h-6 items-center gap-1 rounded-md border-2 border-ink px-1.5 text-[11px]">
            {route === 'device' ? (
              <Zap className="size-3" strokeWidth={2} aria-hidden />
            ) : (
              <Cloud className="size-3" strokeWidth={2} aria-hidden />
            )}
            {route === 'device' ? 'on-device' : 'cloud, free'}
          </span>
        )}
        {state === 'skipped' && (
          <span className="text-[12px] text-black/45">{detail ?? 'Up next'}</span>
        )}
        {state === 'done' && (
          <span
            aria-hidden
            className="flex size-7 items-center justify-center rounded-full bg-ink text-[13px] text-paper"
          >
            ✓
          </span>
        )}
        {state === 'failed' && (
          <span
            aria-hidden
            className="flex size-7 items-center justify-center rounded-full bg-error text-[13px] font-bold text-paper"
          >
            !
          </span>
        )}
      </span>
    </motion.li>
  );
}
