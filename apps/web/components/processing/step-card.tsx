'use client';

import { motion } from 'motion/react';
import { Shimmer } from '@/components/ui/shimmer';
import { cn } from '@/lib/cn';
import type { StepState } from '@/lib/pipeline/events';
import { popIn } from '@/lib/motion/presets';

/**
 * One step of the Processing screen, in the generating panel's language
 * (editor-generating.png, "Progress · Finding moments", figma-export.css l.30187):
 * 50 px, r10, 22 px indicator; done = mint tint + ✓, active = violet border + shimmer.
 */
export function StepCard({
  index,
  title,
  state,
  detail,
}: {
  index: number;
  title: string;
  state: StepState;
  detail?: string;
}) {
  return (
    <motion.li
      layout
      {...popIn}
      data-state={state}
      className={cn(
        'relative flex h-[50px] items-center overflow-hidden rounded-[10px] pr-4 pl-3.5 transition-colors duration-200',
        state === 'active'
          ? 'border border-violet/25 bg-[#252036]'
          : state === 'failed'
            ? 'border border-error/60 bg-[rgb(21_21_29/0.7)]'
            : 'border border-transparent bg-[rgb(21_21_29/0.7)]',
      )}
    >
      {state === 'active' && <Shimmer />}
      <span
        aria-hidden
        className={cn(
          'relative flex size-[22px] shrink-0 items-center justify-center rounded-full text-[12px] leading-4 font-medium',
          state === 'done' && 'bg-mint/10 text-[#76E5B0]',
          state === 'active' && 'bg-violet/10 text-[#CFC5FF]',
          state === 'failed' && 'bg-error/15 text-error',
          (state === 'pending' || state === 'skipped') && 'bg-white/5 text-text-3',
        )}
      >
        {state === 'done' ? '✓' : state === 'failed' ? '!' : index}
      </span>
      <span
        className={cn(
          'relative ml-[11px] text-[13px] leading-[17px] font-medium',
          state === 'done' && 'text-[#D3D0DF]',
          state === 'active' && 'text-[#E0D8FF]',
          state === 'failed' && 'text-text',
          (state === 'pending' || state === 'skipped') && 'text-text-3',
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
              'max-w-[300px] truncate text-[11px] leading-[14px]',
              state === 'failed' ? 'text-error' : 'text-text-2',
            )}
          >
            {detail}
          </motion.span>
        )}
        {state === 'skipped' && (
          <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] leading-[13px] text-text-3">
            {detail ?? 'Up next'}
          </span>
        )}
        {state === 'done' && (
          <span aria-hidden className="text-[11px] leading-[14px] font-medium text-[#76E5B0]">
            ✓
          </span>
        )}
      </span>
    </motion.li>
  );
}
