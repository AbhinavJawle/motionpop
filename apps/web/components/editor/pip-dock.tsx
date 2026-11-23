'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { Pip } from '@/components/pip/pip';
import { popIn } from '@/lib/motion/presets';
import { useAIActivity } from '@/lib/stores/ai-activity';
import { useEditor } from '@/lib/stores/editor';

/**
 * Pip at the bottom of the rail with a speech bubble ("Pip says · 3 slots ready" in the
 * design). Pip thinks while slots generate. The Pip panel itself is spec 10.
 */
export function PipDock() {
  const ready = useEditor((s) => s.project?.slots.filter((x) => x.status === 'ready').length ?? 0);
  const slotsGenerating = useEditor(
    (s) => s.project?.slots.some((x) => x.status === 'generating') ?? false,
  );
  // Any AI action says so (spec 09 R7.6), then "Done!" for 1.2 s after a result lands.
  const working = useAIActivity((s) => s.busy !== null);
  const doneAt = useAIActivity((s) => s.doneAt);
  const [expiredFor, setExpiredFor] = useState<number | null>(null);
  useEffect(() => {
    if (doneAt === null) return;
    const id = setTimeout(() => setExpiredFor(doneAt), 1200);
    return () => clearTimeout(id);
  }, [doneAt]);
  const showDone = doneAt !== null && expiredFor !== doneAt;
  const generating = slotsGenerating || working;
  const message = working
    ? 'Pip is thinking…'
    : showDone
      ? 'Done!'
      : ready > 0
        ? `${ready} slot${ready === 1 ? '' : 's'} ready`
        : generating
          ? 'Pip is thinking…'
          : 'Drop a slot, I’ll fill it';

  // Spec 33: the bubble speaks up when something changes, then gets out of the way; hovering
  // Pip brings it back. While Pip works it stays.
  const [quietFor, setQuietFor] = useState<string | null>(null);
  const [hover, setHover] = useState(false);
  useEffect(() => {
    if (working) return;
    const id = setTimeout(() => setQuietFor(message), 4000);
    return () => clearTimeout(id);
  }, [message, working]);
  const speaking = working || hover || quietFor !== message;

  return (
    // Under an open left panel (z-10): the panel covers the bubble.
    <div
      className="absolute bottom-3 left-[13px] z-[5] flex items-center gap-2"
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
    >
      <Pip
        size={38}
        state={generating ? 'thinking' : showDone ? 'done' : 'idle'}
        decorative
        seed={7}
      />
      <AnimatePresence mode="wait">
        {speaking && (
          <motion.div
            key={message}
            {...popIn}
            role="status"
            className="rounded-lg bg-glass px-3 py-1.5 text-[12px] leading-4 font-medium whitespace-nowrap text-bubble-ink shadow-pop backdrop-blur-[16px]"
          >
            {message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
