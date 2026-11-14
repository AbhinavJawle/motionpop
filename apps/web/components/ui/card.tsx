'use client';

import { motion, type HTMLMotionProps } from 'motion/react';
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { spring } from '@/lib/motion/presets';

/**
 * Surfaces (design-system.md → Shape and depth):
 * - glass: card bg + glass shadow, r12 (default card)
 * - quiet: panel bg + 1px top highlight
 * - frame: preview frame gradient (110.56deg #252334 → #121219) + vignette
 * - summary: "Video summary" in the export dialog (l.66620): r14, raised card
 */
const variants = {
  glass: 'rounded-card bg-card shadow-glass',
  quiet: 'rounded-card bg-panel shadow-quiet',
  frame: 'bg-frame rounded-card shadow-glass',
  summary: 'rounded-[14px] bg-card shadow-glass',
} as const;

export function Card({
  variant = 'glass',
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { variant?: keyof typeof variants }) {
  return (
    <div className={cn('relative', variants[variant], className)} {...rest}>
      {variant === 'frame' && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[inherit] bg-[radial-gradient(50%_50%_at_50%_50%,transparent,rgb(0_0_0/0.24))]"
        />
      )}
      {children}
    </div>
  );
}

/**
 * Selectable option card ("Format · 16:9", "Resolution · 1080p" in the export dialog, l.67220):
 * 48px, r10; selected = ember tint + ember edge + #FFAD85 text, otherwise #1B1823 + hairline.
 */
export function OptionCard({
  selected,
  icon,
  children,
  className,
  ...rest
}: Omit<HTMLMotionProps<'button'>, 'children'> & {
  selected: boolean;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <motion.button
      type="button"
      role="radio"
      aria-checked={selected}
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.98 }}
      transition={spring}
      className={cn(
        'flex h-12 items-center justify-center gap-3 rounded-chip text-[13px] leading-[17px] transition-[background-color,box-shadow,color] duration-200 [&_svg]:size-5',
        selected
          ? 'bg-ember-tint font-medium text-ember-ink shadow-[inset_0_0_0_1px_var(--color-ember)]'
          : 'bg-option text-text-2 shadow-[inset_0_0_0_1px_var(--color-line)] hover:text-text',
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </motion.button>
  );
}
