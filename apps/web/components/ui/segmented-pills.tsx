'use client';

import { motion } from 'motion/react';
import { useId } from 'react';
import { cn } from '@/lib/cn';
import { spring } from '@/lib/motion/presets';

/**
 * "Format switcher" (design/figma-export.css l.246): 186×36, #111118, glass shadow, r10, 4px inset.
 * Selected pill 58×28, #302842, violet glow, r8, Geist 500 12px; others Geist 400 12px text-2.
 * The selected background slides between options with a shared layout animation.
 */
export function SegmentedPills<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
  size = 'md',
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
  label: string;
  className?: string;
  /** `sm` is the compact editor top bar (spec 33). */
  size?: 'sm' | 'md';
}) {
  const sm = size === 'sm';
  const layoutId = useId();
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        'inline-flex items-center gap-0.5 rounded-chip bg-bg-raised p-1 shadow-glass',
        sm ? 'h-8 p-[3px]' : 'h-9',
        className,
      )}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(o.value)}
            className={cn(
              'relative rounded-md text-xs leading-4 transition-colors duration-200',
              sm ? 'h-[26px] min-w-[52px] px-3' : 'h-7 min-w-[58px] px-4',
              selected ? 'font-medium text-text' : 'text-text-2 hover:text-text',
            )}
          >
            {selected && (
              <motion.span
                layoutId={layoutId}
                transition={spring}
                className="absolute inset-0 rounded-md bg-violet-sel shadow-sel"
              />
            )}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
