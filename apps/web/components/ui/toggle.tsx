'use client';

import { motion } from 'motion/react';
import { cn } from '@/lib/cn';
import { spring } from '@/lib/motion/presets';

/**
 * "Captions switch" / "Fade switch" (design/figma-export.css l.1614, l.3143):
 * track 28×16 r8 (on = violet), thumb 12×12 white r6. The thumb springs across.
 * size="lg": the export dialog toggles (export.png, "Export dialog" in the CSS): 40×22, 16px thumb,
 * on = toggle-on, off = toggle-off.
 */
export function Toggle({
  checked,
  onCheckedChange,
  label,
  describedBy,
  disabled,
  size = 'md',
  className,
}: {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  /** Accessible name when no visible label is associated. */
  label?: string;
  /** Id of an element that explains the switch (why it is disabled). */
  describedBy?: string;
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
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'relative inline-flex shrink-0 items-center rounded-full transition-colors duration-200 disabled:opacity-40',
        size === 'lg' ? 'h-[22px] w-10 p-[3px]' : 'h-4 w-7 p-0.5',
        checked
          ? size === 'lg'
            ? 'justify-end bg-toggle-on'
            : 'justify-end bg-violet'
          : size === 'lg'
            ? 'justify-start bg-toggle-off'
            : 'justify-start bg-text-4',
        className,
      )}
    >
      <motion.span
        layout
        transition={spring}
        className={cn('block rounded-full bg-knob', size === 'lg' ? 'size-4' : 'size-3')}
      />
    </button>
  );
}
