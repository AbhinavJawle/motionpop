'use client';

import { Check } from 'lucide-react';
import { motion } from 'motion/react';
import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { paper } from '@/components/paper/kit';
import { cn } from '@/lib/cn';
import { springPop } from '@/lib/motion/presets';
import { useStill } from '@/lib/motion/use-still';

export interface Option<T extends string> {
  value: T;
  label: string;
  sub?: string;
  art: ReactNode;
}

/**
 * A row of illustrated choices (spec 39 R2.5): a radiogroup with arrow keys, the chosen card
 * lifted on a flame shadow with a Selected tag, and an optional "More coming soon" pill.
 */
export function OptionRow<T extends string>({
  label,
  options,
  value,
  onChange,
  soon,
  size = 'md',
  layoutKey,
}: {
  label: string;
  options: readonly Option<T>[];
  value: T | null;
  onChange: (v: T) => void;
  soon?: string;
  size?: 'md' | 'sm';
  /** Unique per row: the Selected tag glides between cards of this row only. */
  layoutKey: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const still = useStill();
  const idx = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const onKey = (e: KeyboardEvent, i: number) => {
    const d =
      e.key === 'ArrowRight' || e.key === 'ArrowDown'
        ? 1
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
          ? -1
          : 0;
    if (!d) return;
    e.preventDefault();
    const n = (i + d + options.length) % options.length;
    onChange(options[n]!.value);
    refs.current[n]?.focus();
  };
  const w = 'w-full';
  const h = size === 'sm' ? 'h-[76px]' : 'h-[96px]';
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        'grid items-start gap-x-4 gap-y-5',
        size === 'sm'
          ? 'grid-cols-[repeat(auto-fill,minmax(112px,1fr))]'
          : 'grid-cols-[repeat(auto-fill,minmax(132px,1fr))]',
      )}
    >
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={i === idx ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn('group flex flex-col items-start text-left outline-none', w)}
          >
            <span
              className={cn(
                'relative block w-full overflow-hidden rounded-[10px] border-2 border-black bg-paper transition-[transform,box-shadow] duration-150',
                h,
                on
                  ? '-translate-x-[2px] -translate-y-[2px] shadow-[5px_5px_0_var(--color-flame)] ring-2 ring-black ring-offset-0'
                  : 'group-hover:-translate-x-[1px] group-hover:-translate-y-[1px] group-hover:shadow-[3px_3px_0_#000]',
                'group-focus-visible:outline-2 group-focus-visible:outline-offset-4 group-focus-visible:outline-[var(--color-pip)]',
              )}
            >
              {o.art}
              {on && (
                <motion.span
                  layoutId={`selected-${layoutKey}`}
                  transition={still ? { duration: 0 } : springPop}
                  className="absolute top-1.5 left-1.5 flex items-center gap-1 rounded-full border-[1.5px] border-black bg-paper px-1.5 py-[1px] text-[10px] leading-[14px] font-semibold"
                >
                  <Check className="size-3" strokeWidth={3} aria-hidden />
                  Selected
                </motion.span>
              )}
            </span>
            <span className="mt-2 text-[13px] leading-[17px] font-semibold">{o.label}</span>
            {o.sub && <span className="text-[11px] leading-[15px] text-black/55">{o.sub}</span>}
          </button>
        );
      })}
      {soon && (
        <span
          className={cn(
            'flex flex-col items-center justify-center gap-1 rounded-[10px] border-2 border-dashed border-black/30 text-center text-[11px] leading-[14px] text-black/50',
            w,
            h,
          )}
        >
          {soon}
        </span>
      )}
    </div>
  );
}

/** An on/off switch in ink (paper toggles). */
export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-[28px] w-[50px] shrink-0 rounded-full border-2 border-black transition-colors',
        checked ? 'bg-ink' : 'bg-paper',
      )}
    >
      <span
        className={cn(
          'absolute top-[2px] size-[20px] rounded-full border-2 border-black transition-[left]',
          checked ? 'left-[24px] bg-flame' : 'left-[2px] bg-paper',
        )}
      />
    </button>
  );
}

/** "01 RECIPE" heading with an optional control on the right and a line under. */
export function Section({
  n,
  title,
  hint,
  right,
  children,
  id,
}: {
  n: number;
  title: string;
  hint?: string;
  right?: ReactNode;
  children?: ReactNode;
  id?: string;
}) {
  return (
    <section
      aria-labelledby={id}
      className="border-t-2 border-ink pt-6 pb-8 first:border-t-0 first:pt-0"
    >
      <div className="mb-4 flex items-start justify-between gap-6">
        <div>
          <h2 id={id} className="flex items-baseline gap-3">
            <span className="font-poster text-[20px] leading-none text-black/35">
              {String(n).padStart(2, '0')}
            </span>
            <span className="font-poster text-[32px] leading-none">{title}</span>
          </h2>
          {hint && <p className="mt-1.5 text-[12px] text-black/60">{hint}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

/** A short text field for "Describe your own…". */
export function DescribeField({
  label,
  value,
  onChange,
  placeholder,
  onCommit,
  status,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  onCommit?: () => void;
  status?: ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-4 max-w-[640px]"
    >
      <div className={cn(paper.field, 'p-1')}>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value.slice(0, 300))}
          onBlur={onCommit}
          aria-label={label}
          rows={2}
          placeholder={placeholder}
          className="block w-full resize-none bg-transparent px-3 py-2 text-[13px] outline-none placeholder:text-black/40"
        />
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[11px] text-black/55">
        <span>{status}</span>
        <span>{value.length}/300</span>
      </div>
    </motion.div>
  );
}
