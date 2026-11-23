'use client';

import { AnimatePresence, motion } from 'motion/react';
import { GeneratingPanel } from '@/components/inspector/generating-panel';
import { InspectorBody } from '@/components/inspector/inspector-body';
import { springSoft } from '@/lib/motion/presets';
import { selectSelectedSlot, useEditor } from '@/lib/stores/editor';

export { INSPECTOR_PROMPT_ID } from '@/components/inspector/prompt-box';

/**
 * Graphic inspector, 360 px, shown while a slot is selected (spec 04 R3.4); the generating panel replaces the sections while
 * that slot is being generated (spec 09 R1.3). The sections live in
 * `components/inspector/` (spec 09 task 12).
 */
export function Inspector() {
  const slot = useEditor(selectSelectedSlot);
  const generatingHere = useEditor((s) => s.generating?.slotId === s.selectedSlotId);
  return (
    <AnimatePresence initial={false}>
      {slot && (
        <motion.aside
          key="inspector"
          aria-label="Graphic inspector"
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 360, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={springSoft}
          className="shrink-0 overflow-hidden border-l-2 border-rule bg-paper"
        >
          <div className="h-full w-[359px] overflow-y-auto px-4 pb-6">
            {generatingHere ? <GeneratingPanel slot={slot} /> : <InspectorBody slot={slot} />}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
