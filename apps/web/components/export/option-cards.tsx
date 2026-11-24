'use client';

import { motion } from 'motion/react';
import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { spring } from '@/lib/motion/presets';
import { SoonPill } from './soon-pill';

export interface OptionCard<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
  /** Shown disabled with a "Soon" pill; the reason is read out as the card's description. */
  soon?: string;
  /** Disabled without a "Soon" pill (e.g. Reel vertical format lock, spec 46 R4.1). */
  disabledReason?: string;
}

/**
 * A radio group of option cards (export.png: Format and Resolution). Roving tabindex: arrow keys
 * move the selection, Home and End jump. Disabled "Soon" cards are skipped by the arrows and say
 * why they are disabled (R1.13). Cards lift 1 px on hover and press to 0.97 with a spring.
 */
export function OptionCards<T extends string>({
  label,
  options,
  value,
  onChange,
  cardClassName,
}: {
  label: string;
  options: readonly OptionCard<T>[];
  value: T;
  onChange: (next: T) => void;
  cardClassName: string;
}) {
  const refs = useRef(new Map<T, HTMLButtonElement>());
  const groupId = useId();
  const enabled = options.filter((o) => !o.soon && !o.disabledReason);

  const move = (from: T, delta: number | 'first' | 'last') => {
    if (enabled.length === 0) return;
    const i = enabled.findIndex((o) => o.value === from);
    let next: OptionCard<T> | undefined;
    if (i < 0) next = delta === 'last' ? enabled[enabled.length - 1] : enabled[0];
    else if (delta === 'first') next = enabled[0];
    else if (delta === 'last') next = enabled[enabled.length - 1];
    else next = enabled[(i + delta + enabled.length) % enabled.length];
    if (!next) return;
    if (next.value !== value) onChange(next.value);
    refs.current.get(next.value)?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, v: T) => {
    const keys: Record<string, number | 'first' | 'last'> = {
      ArrowRight: 1,
      ArrowDown: 1,
      ArrowLeft: -1,
      ArrowUp: -1,
      Home: 'first',
      End: 'last',
    };
    const delta = keys[e.key];
    if (delta === undefined) return;
    e.preventDefault();
    move(v, delta);
  };

  return (
    <div role="radiogroup" aria-label={label} className="flex gap-2">
      {options.map((o) => {
        const selected = o.value === value;
        const reason = o.soon ?? o.disabledReason;
        const isDisabled = Boolean(reason);
        const descId = reason ? `${groupId}-${o.value}` : undefined;
        return (
          <motion.button
            key={o.value}
            ref={(el) => {
              if (el) refs.current.set(o.value, el);
              else refs.current.delete(o.value);
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-disabled={isDisabled ? true : undefined}
            aria-describedby={descId}
            tabIndex={selected ? 0 : -1}
            onClick={() => {
              if (!isDisabled) onChange(o.value);
            }}
            onKeyDown={(e) => onKeyDown(e, o.value)}
            {...(isDisabled ? {} : { whileHover: { y: -1 }, whileTap: { scale: 0.97 } })}
            transition={spring}
            className={cn(
              'flex flex-1 items-center justify-center gap-2.5 rounded-[10px] text-[13px] leading-[17px] font-medium transition-[background-color,box-shadow,color] duration-200',
              cardClassName,
              selected
                ? 'bg-white/[0.08] text-text shadow-[inset_0_0_0_1.5px_var(--color-edge)]'
                : 'bg-white/[0.025] text-text-2 shadow-[inset_0_0_0_1px_rgb(0_0_0/0.12)] hover:bg-white/[0.05] hover:text-text',
              isDisabled && 'cursor-not-allowed text-text-4',
            )}
          >
            {o.icon}
            <span>{o.label}</span>
            {o.soon && <SoonPill className="-ml-1.5" />}
            {reason && (
              <span id={descId} className="sr-only">
                {reason}
              </span>
            )}
          </motion.button>
        );
      })}
    </div>
  );
}
