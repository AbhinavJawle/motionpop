'use client';

import { motion, type HTMLMotionProps } from 'motion/react';
import { forwardRef } from 'react';
import { cn } from '@/lib/cn';
import { buttonMotion } from '@/lib/motion/presets';

/**
 * Measured from design/figma-export.css:
 * - primary  = "Export button" (l.590): 114×36, r10, ember gradient, ember glow + glass, Geist 600 12px white.
 * - ai       = "Generate" (l.2554): h26, r8, violet fill, violet glow, Geist 500 10px #C9BDFF.
 * - secondary = "Brand kit" / "120 credits" (l.428, l.540): h32, r10, card bg, glass shadow, 11–12px text.
 * Hover lifts 1px with a stronger glow, press scales to 0.97 (design-system.md → UI motion).
 */
const variants = {
  primary: 'bg-ember-grad text-white font-semibold shadow-ember hover:brightness-110',
  ai: 'bg-violet-fill text-violet-ink font-medium shadow-generate hover:brightness-115',
  secondary: 'bg-card text-text shadow-glass hover:bg-card-2',
  ghost: 'bg-transparent text-text-2 hover:bg-card hover:text-text',
} as const;

const sizes = {
  sm: 'h-[26px] gap-1.5 rounded-lg px-3 text-[10px] leading-[13px]',
  md: 'h-8 gap-2 rounded-chip px-3 text-[11px] leading-[14px]',
  lg: 'h-9 gap-2 rounded-chip px-4 text-xs leading-4',
  icon: 'size-8 rounded-chip p-0',
} as const;

export type ButtonVariant = keyof typeof variants;
export type ButtonSize = keyof typeof sizes;

export interface ButtonProps extends HTMLMotionProps<'button'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', className, type = 'button', disabled, ...rest },
  ref,
) {
  return (
    <motion.button
      ref={ref}
      type={type}
      disabled={disabled}
      {...(disabled ? {} : buttonMotion)}
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap transition-[filter,background-color,color,box-shadow] duration-200 disabled:cursor-not-allowed disabled:opacity-40 [&_svg]:size-4 [&_svg]:shrink-0',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    />
  );
});
