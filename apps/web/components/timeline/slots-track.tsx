'use client';

import { INSPECTOR_PROMPT_ID } from '@/components/editor/inspector';
import { msToX } from '@/lib/timeline/geometry';
import { selectSlots, useEditor } from '@/lib/stores/editor';
import { SlotCard } from './slot-card';
import { useTimeline } from './timeline-context';

/** SLOTS track: one card per slot, positioned by time. Dragging lands in task 9. */
export function SlotsTrack() {
  const { view } = useTimeline();
  const slots = useEditor(selectSlots);
  const selectedId = useEditor((s) => s.selectedSlotId);
  const select = useEditor((s) => s.select);
  const preview = useEditor((s) => s.dragPreview);

  if (slots.length === 0) {
    return (
      <p className="absolute top-1/2 left-4 -translate-y-1/2 text-[11px] text-text-3">
        No graphics yet. Shift-drag across words to add one.
      </p>
    );
  }

  return (
    <>
      {slots.map((slot) => {
        const range = preview?.slotId === slot.id ? preview : slot;
        const left = msToX(range.startMs, view);
        const width = Math.max(8, msToX(range.endMs, view) - left);
        return (
          <SlotCard
            key={slot.id}
            entry={slot}
            selected={slot.id === selectedId}
            width={width}
            className="z-[2]"
            style={{ left }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => select(slot.id)}
            onDoubleClick={() => {
              select(slot.id);
              requestAnimationFrame(() => document.getElementById(INSPECTOR_PROMPT_ID)?.focus());
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                select(slot.id);
              }
            }}
          />
        );
      })}
    </>
  );
}
