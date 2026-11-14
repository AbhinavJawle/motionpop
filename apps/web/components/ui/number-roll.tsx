'use client';

import { motion } from 'motion/react';
import { useStill } from '@/lib/motion/use-still';
import { cn } from '@/lib/cn';
import { springSoft } from '@/lib/motion/presets';

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

export interface NumberRollProps {
  value: number;
  /** Fraction digits to show. */
  decimals?: number;
  /** Group thousands with the locale separator (credits: 1,240). */
  group?: boolean;
  prefix?: string;
  suffix?: string;
  className?: string;
  /** Accessible label; defaults to the formatted value. */
  'aria-label'?: string;
}

export function formatRoll(value: number, decimals = 0, group = true): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: group,
  });
}

/**
 * Odometer-style number: each digit is a 0–9 column that springs to its value.
 * Mono + tabular figures so widths never jump. Reduced motion → digits swap instantly.
 */
export function NumberRoll({
  value,
  decimals = 0,
  group = true,
  prefix,
  suffix,
  className,
  'aria-label': ariaLabel,
}: NumberRollProps) {
  const reduce = useStill();
  const text = formatRoll(value, decimals, group);
  const chars = text.split('');
  return (
    <span
      className={cn('tabular inline-flex items-baseline font-mono', className)}
      role="img"
      aria-label={ariaLabel ?? `${prefix ?? ''}${text}${suffix ?? ''}`}
    >
      {prefix && <span aria-hidden>{prefix}</span>}
      {chars.map((ch, i) => {
        // Key digits from the right so "99 → 100" rolls the existing columns and adds one on the left.
        const key = chars.length - i;
        const d = DIGITS.indexOf(ch);
        if (d === -1) {
          return (
            <span key={`s${key}`} aria-hidden>
              {ch}
            </span>
          );
        }
        return (
          <span
            key={`d${key}`}
            aria-hidden
            className="relative inline-block h-[1.2em] overflow-hidden leading-[1.2em]"
          >
            <span className="invisible">0</span>
            <motion.span
              className="absolute inset-x-0 top-0 flex flex-col"
              initial={false}
              animate={{ y: `${-d * 1.2}em` }}
              transition={reduce ? { duration: 0 } : springSoft}
            >
              {DIGITS.map((n) => (
                <span key={n} className="h-[1.2em]">
                  {n}
                </span>
              ))}
            </motion.span>
          </span>
        );
      })}
      {suffix && <span aria-hidden>{suffix}</span>}
    </span>
  );
}
