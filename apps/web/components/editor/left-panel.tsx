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
          className="relative z-10 shrink-0 border-r-2 border-rule bg-paper"
        >
          <div className="h-full w-[340px] overflow-hidden">{children}</div>
          <button
            type="button"
            aria-label="Collapse panel"
            onClick={onClose}
            className="absolute top-4 -right-[13px] z-20 flex size-6 items-center justify-center rounded-full border-[1.5px] border-edge bg-paper text-ink transition-colors hover:bg-mist"
          >
            <ChevronLeft className="size-3.5" strokeWidth={1.5} aria-hidden />
          </button>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
