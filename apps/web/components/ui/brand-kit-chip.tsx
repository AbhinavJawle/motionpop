'use client';

import { Star } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '@/lib/cn';
import { buttonMotion } from '@/lib/motion/presets';

/**
 * "Brand kit" (design/figma-export.css l.428): 132×32, card bg, glass shadow, r10;
 * star 16px, Geist 11px, three 7px dots. Dot colours are the user's brand colours (defaults from the design).
 */
export function BrandKitChip({
  colors = ['var(--color-ember)', 'var(--color-violet)', 'var(--color-text)'],
  onClick,
  className,
}: {
  colors?: readonly [string, string, string];
  onClick?: () => void;
  className?: string;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      {...buttonMotion}
      className={cn(
        'inline-flex h-8 w-[132px] items-center gap-2 rounded-chip bg-card pr-3 pl-2.5 text-[11px] leading-[14px] text-text shadow-glass hover:bg-card-2',
        className,
      )}
    >
      <Star className="size-4" strokeWidth={1.5} aria-hidden />
      Brand kit
      <span className="ml-auto flex items-center gap-[3px]" aria-hidden>
        {colors.map((c, i) => (
          <motion.span
            key={i}
            className="size-[7px] rounded-full"
            style={{ background: c }}
            whileHover={{ scale: 1.3 }}
          />
        ))}
      </span>
    </motion.button>
  );
}
