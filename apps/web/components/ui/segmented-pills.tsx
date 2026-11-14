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
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
  label: string;
  className?: string;
}) {
  const layoutId = useId();
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        'inline-flex h-9 items-center gap-0.5 rounded-chip bg-bg-raised p-1 shadow-glass',
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
              'relative h-7 min-w-[58px] rounded-lg px-4 text-xs leading-4 transition-colors duration-200',
              selected ? 'font-medium text-text' : 'text-text-2 hover:text-text',
            )}
          >
            {selected && (
              <motion.span
                layoutId={layoutId}
                transition={spring}
                className="absolute inset-0 rounded-lg bg-violet-sel shadow-sel"
              />
            )}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
