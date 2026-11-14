'use client';

import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from '@/lib/cn';

/**
 * Fields, measured from design/figma-export.css:
 * - "Title text field" (l.2641): 28px, r8, card bg, glass shadow, Geist 12px.
 * - "Quick edit · free on-device" (l.3431): 32px, r8, 10px placeholder, trailing route chip.
 * - "Graphic prompt · editable" (l.2501): 72px, r10, Geist 12/16 soft body text.
 * Focus: violet ring (globals.css) plus a faint violet glow.
 */

const field =
  'w-full rounded-lg bg-card text-text shadow-glass outline-none transition-shadow duration-200 placeholder:text-text-3 focus-within:shadow-violet-glow disabled:opacity-40';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Trailing adornment (cost chip, unit). */
  trailing?: ReactNode;
  /** Leading adornment (icon). */
  leading?: ReactNode;
  density?: 'default' | 'roomy';
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, trailing, leading, density = 'default', ...rest },
  ref,
) {
  const height = density === 'roomy' ? 'h-8 text-[10px] leading-[13px]' : 'h-7 text-xs leading-4';
  if (!trailing && !leading) {
    return <input ref={ref} className={cn(field, height, 'px-3', className)} {...rest} />;
  }
  return (
    <label className={cn(field, height, 'flex items-center gap-2 px-3', className)}>
      {leading}
      <input
        ref={ref}
        className="h-full min-w-0 flex-1 bg-transparent outline-none placeholder:text-text-3 focus-visible:outline-none"
        {...rest}
      />
      {trailing}
    </label>
  );
});

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & { footer?: ReactNode }
>(function Textarea({ className, footer, rows = 3, ...rest }, ref) {
  return (
    <div
      className={cn(field, 'flex min-h-[72px] flex-col rounded-chip px-3 pt-2.5 pb-2', className)}
    >
      <textarea
        ref={ref}
        rows={rows}
        className="w-full flex-1 resize-none bg-transparent text-xs leading-4 text-text-body outline-none placeholder:text-text-3 focus-visible:outline-none"
        {...rest}
      />
      {footer && <div className="flex justify-end">{footer}</div>}
    </div>
  );
});
