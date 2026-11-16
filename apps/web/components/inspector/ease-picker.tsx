'use client';

import { Check } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useId, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { EASE_LABELS, easeCurvePath, type EaseChoice } from '@/lib/inspector/timing-view';
import { popIn } from '@/lib/motion/presets';

/** The ease curve as a 30×16 SVG, 1.5 px `curve` stroke (design: "Ease in-out" frame). */
export function EaseCurve({ choice, className }: { choice: EaseChoice; className?: string }) {
  return (
    <svg
      aria-hidden
      width={30}
      height={16}
      viewBox="0 0 30 16"
      fill="none"
      className={cn('shrink-0', className)}
    >
      <path
        d={easeCurvePath(choice)}
        stroke="var(--color-curve)"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const CHOICES: EaseChoice[] = ['inOut', 'out', 'linear'];

/**
 * "Ease in-out": a 127×25 chip with the curve and the name; it opens a menu of "Look default"
 * and the three eases, each with its curve drawn (spec 09 R4.2). `value` is the ease the slot
 * plays with; `own` says whether the slot overrides the look.
 */
export function EasePicker({
  value,
  own,
  onChange,
}: {
  value: EaseChoice;
  own: boolean;
  /** `undefined` = the look's default. */
  onChange: (next: EaseChoice | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  const pick = (next: EaseChoice | undefined) => {
    setOpen(false);
    onChange(next);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={`Ease: ${EASE_LABELS[value]}${own ? '' : ' (look default)'}`}
        onClick={() => setOpen((o) => !o)}
        className="flex h-[25px] w-[127px] items-center rounded-[7px] bg-card pl-2 text-left shadow-glass transition-colors hover:bg-card-2"
      >
        <EaseCurve choice={value} />
        <span className="ml-[7px] flex-1 text-[10px] leading-[13px] text-text-2">
          {EASE_LABELS[value]}
        </span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            {...popIn}
            id={listId}
            role="menu"
            aria-label="Ease"
            className="absolute bottom-full left-0 z-50 mb-1 w-[168px] origin-bottom-left rounded-card bg-card-2 p-1 shadow-glass"
          >
            <EaseItem
              label="Look default"
              hint={EASE_LABELS[value]}
              selected={!own}
              onSelect={() => pick(undefined)}
            />
            {CHOICES.map((c) => (
              <EaseItem
                key={c}
                label={EASE_LABELS[c]}
                curve={c}
                selected={own && value === c}
                onSelect={() => pick(c)}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function EaseItem({
  label,
  curve,
  hint,
  selected,
  onSelect,
}: {
  label: string;
  curve?: EaseChoice;
  hint?: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={selected}
      onClick={onSelect}
      className="flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-[11px] leading-[14px] text-text-body transition-colors hover:bg-card-3 hover:text-text"
    >
      {curve ? <EaseCurve choice={curve} /> : <span className="w-[30px] shrink-0" aria-hidden />}
      <span className="flex-1">{label}</span>
      {hint && !selected && <span className="text-[10px] text-text-3">{hint}</span>}
      {selected && <Check className="size-3 text-violet" strokeWidth={2} aria-hidden />}
    </button>
  );
}
