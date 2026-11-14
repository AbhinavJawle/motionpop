'use client';

import { cn } from '@/lib/cn';
import { Pip } from './pip';

/**
 * "Creator avatar · Pip" (design/figma-export.css l.686): 32×32 circle, #403451, Pip inside.
 * Also the avatar fallback and the rail/logo face. Idle Pip: blinks and floats gently.
 */
export function PipAvatar({
  size = 32,
  ring = true,
  className,
}: {
  size?: number;
  /** Circle background (avatar). Off = bare mark (logo). */
  ring?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full',
        ring && 'bg-avatar shadow-quiet',
        className,
      )}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <Pip size={Math.round(size * (ring ? 0.82 : 1))} decorative look={{ x: 0, y: 0 }} />
    </span>
  );
}
