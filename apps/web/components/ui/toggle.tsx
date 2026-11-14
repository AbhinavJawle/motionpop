'use client';

import { motion } from 'motion/react';
import { cn } from '@/lib/cn';
import { spring } from '@/lib/motion/presets';

/**
 * "Captions switch" / "Fade switch" (design/figma-export.css l.1614, l.3143):
 * track 28×16 r8 (on = violet), thumb 12×12 white r6. The thumb springs across.
 * size="lg": the export dialog toggles (export.png), 40×22 with an 18px thumb.
 */
export function Toggle({
  checked,
  onCheckedChange,
  label,
  disabled,
  size = 'md',
  className,
}: {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  /** Accessible name when no visible label is associated. */
  label?: string;
  disabled?: boolean;
  size?: 'md' | 'lg';
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'relative inline-flex shrink-0 items-center rounded-full transition-colors duration-200 disabled:opacity-40',
        size === 'lg' ? 'h-[22px] w-10 p-0.5' : 'h-4 w-7 p-0.5',
        checked ? 'justify-end bg-violet' : 'justify-start bg-text-4',
        className,
      )}
    >
      <motion.span
        layout
        transition={spring}
        className={cn('block rounded-full bg-white', size === 'lg' ? 'size-[18px]' : 'size-3')}
      />
    </button>
  );
}
