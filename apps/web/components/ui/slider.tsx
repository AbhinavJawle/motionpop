'use client';

import { motion } from 'motion/react';
import { useCallback, useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { cn } from '@/lib/cn';
import { spring } from '@/lib/motion/presets';

/**
 * "Duration slider" (design/figma-export.css l.3033): track 3px #34303F r2, value violet,
 * handle 10×10 #D2C8FF. "Timeline zoom" uses tone="neutral" (value #A09EAE).
 * Keyboard: arrows step, PageUp/PageDown ×10, Home/End.
 */
export function Slider({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  label,
  tone = 'violet',
  className,
  format,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label: string;
  tone?: 'violet' | 'neutral';
  className?: string;
  /** aria-valuetext formatter, e.g. v => `${v}s`. */
  format?: (v: number) => string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const clampStep = useCallback(
    (v: number) => {
      const stepped = Math.round((v - min) / step) * step + min;
      const fixed = Number(stepped.toFixed(6));
      return Math.min(max, Math.max(min, fixed));
    },
    [min, max, step],
  );
  const pct = max === min ? 0 : ((value - min) / (max - min)) * 100;

  const fromPointer = (clientX: number) => {
    const r = trackRef.current?.getBoundingClientRect();
    if (!r || r.width === 0) return;
    onChange(clampStep(min + ((clientX - r.left) / r.width) * (max - min)));
  };
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    fromPointer(e.clientX);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) fromPointer(e.clientX);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const big = step * 10;
    const next =
      e.key === 'ArrowRight' || e.key === 'ArrowUp'
        ? value + step
        : e.key === 'ArrowLeft' || e.key === 'ArrowDown'
          ? value - step
          : e.key === 'PageUp'
            ? value + big
            : e.key === 'PageDown'
              ? value - big
              : e.key === 'Home'
                ? min
                : e.key === 'End'
                  ? max
                  : null;
    if (next === null) return;
    e.preventDefault();
    onChange(clampStep(next));
  };

  return (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={format?.(value)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onKeyDown={onKeyDown}
      className={cn(
        'group relative flex h-4 w-full cursor-pointer touch-none items-center rounded-full',
        className,
      )}
    >
      <div className="relative h-[3px] w-full rounded-full bg-track">
        <div
          className={cn(
            'absolute inset-y-0 left-0 rounded-full',
            tone === 'violet' ? 'bg-violet' : 'bg-text-2',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <motion.div
        className={cn(
          'absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full shadow-glass',
          tone === 'violet' ? 'bg-violet-thumb' : 'bg-text',
        )}
        style={{ left: `${pct}%` }}
        whileHover={{ scale: 1.3 }}
        whileTap={{ scale: 1.15 }}
        transition={spring}
      />
    </div>
  );
}
