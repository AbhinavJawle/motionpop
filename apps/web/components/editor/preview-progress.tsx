'use client';

import { AnimatePresence, motion } from 'motion/react';
import { generateMedianMs } from '@/lib/slots/generate-timing';
import { useStill } from '@/lib/motion/use-still';
import { useEditor } from '@/lib/stores/editor';

/**
 * The thin progress line along the frame's top edge while a Generate runs (spec 09 R6.4;
 * editor-generating.png): 2 px, violet to mint, filling to 90 % over the last measured median
 * (6 s when there is none), then to 100 % as it leaves. Reduced motion: a static 60 %.
 * Place inside the frame card (`relative`, `overflow-hidden`).
 */
export function PreviewProgress() {
  const generating = useEditor((s) => s.generating);
  const still = useStill();
  return (
    <AnimatePresence>
      {generating && (
        <motion.div
          key={generating.slotId}
          aria-hidden
          data-preview-progress
          className="pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5 origin-left bg-[linear-gradient(90deg,var(--color-violet),var(--color-mint))]"
          initial={{ scaleX: 0, opacity: 1 }}
          animate={{
            scaleX: still ? 0.6 : 0.9,
            transition: still
              ? { duration: 0 }
              : { duration: generateMedianMs() / 1000, ease: 'easeOut' },
          }}
          exit={{
            scaleX: 1,
            opacity: 0,
            transition: still ? { duration: 0 } : { duration: 0.35, ease: 'easeOut' },
          }}
        />
      )}
    </AnimatePresence>
  );
}
