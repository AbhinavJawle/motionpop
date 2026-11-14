'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useId, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { springPop } from '@/lib/motion/presets';
import { Kbd } from './kbd';

/**
 * Small tooltip for icon buttons (undo, redo, history, rail). Opens after 400 ms on hover or
 * immediately on keyboard focus; optional shortcut shown as a Kbd.
 */
export function Tooltip({
  content,
  shortcut,
  side = 'bottom',
  children,
  className,
}: {
  content: string;
  shortcut?: string;
  side?: 'top' | 'bottom';
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const id = useId();
  const show = (delay: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(true), delay);
  };
  const hide = () => {
    if (timer.current) clearTimeout(timer.current);
    setOpen(false);
  };
  return (
    <span
      className={cn('relative inline-flex', className)}
      onPointerEnter={() => show(400)}
      onPointerLeave={hide}
      onFocus={() => show(0)}
      onBlur={hide}
      aria-describedby={open ? id : undefined}
    >
      {children}
      <AnimatePresence>
        {open && (
          <motion.span
            id={id}
            role="tooltip"
            initial={{ opacity: 0, scale: 0.92, y: side === 'bottom' ? -4 : 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={springPop}
            className={cn(
              'pointer-events-none absolute left-1/2 z-50 flex -translate-x-1/2 items-center gap-1.5 rounded-lg bg-card-3 px-2 py-1 text-[11px] leading-[14px] whitespace-nowrap text-text shadow-glass',
              side === 'bottom' ? 'top-full mt-2' : 'bottom-full mb-2',
            )}
          >
            {content}
            {shortcut && <Kbd className="h-4 bg-white/10">{shortcut}</Kbd>}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
