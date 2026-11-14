'use client';

import { AnimatePresence, motion } from 'motion/react';
import { Pip } from '@/components/pip/pip';
import { popIn } from '@/lib/motion/presets';
import { useEditor } from '@/lib/stores/editor';

/**
 * Pip at the bottom of the rail with a speech bubble ("Pip says · 3 slots ready" in the
 * design). Pip thinks while slots generate. The Pip panel itself is spec 10.
 */
export function PipDock() {
  const ready = useEditor((s) => s.project?.slots.filter((x) => x.status === 'ready').length ?? 0);
  const generating = useEditor(
    (s) => s.project?.slots.some((x) => x.status === 'generating') ?? false,
  );
  const message =
    ready > 0
      ? `${ready} slot${ready === 1 ? '' : 's'} ready`
      : generating
        ? 'Pip is thinking…'
        : 'Drop a slot, I’ll fill it';

  return (
    <div className="pointer-events-none absolute bottom-[16px] left-3 z-20 flex items-center gap-[7px]">
      <Pip size={38} state={generating ? 'thinking' : 'idle'} decorative seed={7} />
      <AnimatePresence mode="wait">
        <motion.div
          key={message}
          {...popIn}
          role="status"
          className="pointer-events-auto rounded-chip bg-glass px-[17px] py-2 text-[11px] leading-[14px] font-medium text-bubble-ink shadow-glass backdrop-blur-[16px]"
        >
          {message}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
