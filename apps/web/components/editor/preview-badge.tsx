'use client';

import { AnimatePresence, motion } from 'motion/react';
import { StatusDot } from '@/components/ui/status-dot';
import { popIn } from '@/lib/motion/presets';
import { secondsText, useAIActivity } from '@/lib/stores/ai-activity';
import { useEditor } from '@/lib/stores/editor';

/**
 * "Generation speed" (design/figma-export.css): 158×26, 16 px from the frame's top right, glass
 * pill, mint dot, mono 11 px `ready-ink`. "● Ready in 4.2s" for the selected slot's last AI
 * result of this session (R7.6), "● Generating…" while a Generate runs (R6.4). Hidden otherwise.
 */
export function PreviewBadge() {
  const selected = useEditor((s) => s.selectedSlotId);
  const busy = useAIActivity((s) => s.busy);
  const ready = useAIActivity((s) => s.ready);
  const generating = busy?.kind === 'generate' && busy.slotId === selected;
  const text = generating
    ? 'Generating…'
    : ready && ready.slotId === selected
      ? `Ready in ${secondsText(ready.ms)}`
      : null;
  return (
    <AnimatePresence>
      {text && (
        <motion.div
          key={generating ? 'generating' : 'ready'}
          {...popIn}
          role="status"
          className="absolute top-4 right-4 z-10 flex h-[26px] w-[158px] origin-top-right items-center gap-[7px] rounded-[13px] bg-glass pr-3.5 pl-[11px] font-mono text-[11px] leading-[14px] whitespace-nowrap text-ready-ink shadow-glass backdrop-blur-[16px]"
        >
          <StatusDot tone="mint" className="size-1.5" />
          {text}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
