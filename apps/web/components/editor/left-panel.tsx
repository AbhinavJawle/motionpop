'use client';

import { ChevronLeft } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, type ReactNode } from 'react';
import { easeOutSoft } from '@/lib/motion/presets';
import { useStill } from '@/lib/motion/use-still';

export const LEFT_PANEL_WIDTH = 340;

/**
 * The left panel container (design-system.md "Layout"): 340 px between the rail and the preview,
 * which shrinks; the inspector and timeline stay. Slides and fades in 240 ms (instant under reduced
 * motion), a collapse chevron sits on its right edge, Escape closes it. Spec 13 adds Settings here;
 * spec 10's rail panels use the same container.
 */
export function LeftPanel({
  open,
  label,
  onClose,
  children,
}: {
  open: boolean;
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const still = useStill();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Leave Escape to an open dialog or menu first.
      if (document.querySelector('[role="dialog"], [role="menu"]')) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.aside
          key="left-panel"
          aria-label={label}
          data-left-panel
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: LEFT_PANEL_WIDTH, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: still ? 0 : 0.24, ease: easeOutSoft }}
          className="relative z-10 shrink-0 border-r border-white/6 bg-panel"
        >
          <div className="h-full w-[340px] overflow-hidden">{children}</div>
          <button
            type="button"
            aria-label="Collapse panel"
            onClick={onClose}
            className="absolute top-[260px] -right-3 z-20 flex size-6 items-center justify-center rounded-full bg-card-2 text-text-2 shadow-glass transition-colors hover:text-text"
          >
            <ChevronLeft className="size-3.5" strokeWidth={1.5} aria-hidden />
          </button>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
