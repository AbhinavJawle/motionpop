'use client';

import { motion } from 'motion/react';
import { cn } from '@/lib/cn';
import { spring } from '@/lib/motion/presets';

/**
 * "Captions switch" / "Fade switch" (design/figma-export.css l.1614, l.3143):
 * track 28×16 r8 (on = violet), thumb 12×12 white r6. The thumb springs across.
 */
export function Toggle({
  checked,
  onCheckedChange,
  label,
  disabled,
  className,
}: {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  /** Accessible name when no visible label is associated. */
  label?: string;
  disabled?: boolean;
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
        'relative inline-flex h-4 w-7 shrink-0 items-center rounded-full p-0.5 transition-colors duration-200 disabled:opacity-40',
        checked ? 'justify-end bg-violet' : 'justify-start bg-text-4',
        className,
      )}
    >
      <motion.span layout transition={spring} className="block size-3 rounded-full bg-white" />
    </button>
  );
}
