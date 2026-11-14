'use client';

import { motion } from 'motion/react';
import { useId, useRef, type KeyboardEvent } from 'react';
import { cn } from '@/lib/cn';
import { spring } from '@/lib/motion/presets';

/**
 * Underline tabs ("Transcript" + "Active tab", design/figma-export.css l.3630):
 * Geist 500 13px, active text, 2px violet underline r1 that slides between tabs.
 * Arrow keys move between tabs (roving tabindex).
 */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  className,
}: {
  tabs: readonly { value: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
  label: string;
  className?: string;
}) {
  const layoutId = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (e: KeyboardEvent, i: number) => {
    const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const next = (i + dir + tabs.length) % tabs.length;
    const t = tabs[next];
    if (!t) return;
    onChange(t.value);
    refs.current[next]?.focus();
  };
  return (
    <div role="tablist" aria-label={label} className={cn('flex items-end gap-6', className)}>
      {tabs.map((t, i) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(t.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              'relative pb-2.5 text-[13px] leading-[17px] font-medium transition-colors duration-200',
              active ? 'text-text' : 'text-text-2 hover:text-text',
            )}
          >
            {t.label}
            {active && (
              <motion.span
                layoutId={layoutId}
                transition={spring}
                className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-violet"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
