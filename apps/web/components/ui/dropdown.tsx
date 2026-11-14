'use client';

import { Check, ChevronDown } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { popIn } from '@/lib/motion/presets';

export interface DropdownOption<T extends string> {
  value: T;
  label: string;
  /** Leading visual (style swatch, icon). */
  icon?: ReactNode;
  hint?: string;
}

/**
 * Select-style dropdown ("Style" row with "Dropdown chevron", design/figma-export.css l.2940):
 * trigger is a quiet row (11px text, 12px chevron); the menu is a glass card that pops in.
 * Listbox semantics: ↑/↓ move, Enter/Space choose, Escape closes, outside click closes.
 */
export function Dropdown<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
  menuClassName,
}: {
  options: readonly DropdownOption<T>[];
  value: T;
  onChange: (next: T) => void;
  label: string;
  className?: string;
  menuClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = options.find((o) => o.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [open]);

  const openMenu = () => {
    setActive(
      Math.max(
        0,
        options.findIndex((o) => o.value === value),
      ),
    );
    setOpen(true);
  };
  const choose = (i: number) => {
    const o = options[i];
    if (o) onChange(o.value);
    setOpen(false);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(options.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      choose(active);
    }
  };

  return (
    <div ref={rootRef} className={cn('relative', className)} onKeyDown={onKeyDown}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={`${label}: ${selected?.label ?? ''}`}
        onClick={() => (open ? setOpen(false) : openMenu())}
        className="flex h-8 w-full items-center gap-2.5 rounded-lg px-1 text-left text-[11px] leading-[14px] text-text-body transition-colors hover:bg-card"
      >
        {selected?.icon}
        <span className="flex-1 truncate">{selected?.label}</span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} className="text-text-3">
          <ChevronDown className="size-3" strokeWidth={1.5} aria-hidden />
        </motion.span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.ul
            {...popIn}
            id={listId}
            role="listbox"
            aria-label={label}
            className={cn(
              'absolute top-full right-0 left-0 z-50 mt-1 origin-top rounded-card bg-card-2 p-1 shadow-glass',
              menuClassName,
            )}
          >
            {options.map((o, i) => {
              const isSel = o.value === value;
              return (
                <li
                  key={o.value}
                  role="option"
                  aria-selected={isSel}
                  onPointerEnter={() => setActive(i)}
                  onClick={() => choose(i)}
                  className={cn(
                    'flex h-8 cursor-pointer items-center gap-2.5 rounded-lg px-2 text-[11px] leading-[14px]',
                    i === active ? 'bg-card-3 text-text' : 'text-text-body',
                  )}
                >
                  {o.icon}
                  <span className="flex-1 truncate">{o.label}</span>
                  {o.hint && <span className="text-[10px] text-text-3">{o.hint}</span>}
                  {isSel && <Check className="size-3 text-violet" strokeWidth={2} aria-hidden />}
                </li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
