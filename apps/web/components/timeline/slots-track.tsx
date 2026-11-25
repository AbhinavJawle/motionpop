'use client';

import { INSPECTOR_PROMPT_ID } from '@/components/editor/inspector';
import { msToX } from '@/lib/timeline/geometry';
import { selectSlots, useEditor } from '@/lib/stores/editor';
import { useStill } from '@/lib/motion/use-still';
import { isReelEngine, type Slot } from '@motionpop/schemas';
import { slotHeroMs } from '@/lib/editor/key-moment';
import { SlotCard } from './slot-card';
import { useTimeline } from './timeline-context';
import { startSlotDrag } from './slot-drag';
import { ReelScenesTrack } from './reel-scenes-track';

/** Magnetic settle onto a word boundary (spec 04 R6.1: 120–180 ms). */
const SETTLE =
  'left 150ms cubic-bezier(0.2, 0.9, 0.3, 1.2), width 150ms cubic-bezier(0.2, 0.9, 0.3, 1.2)';

/** SLOTS track: one card per slot, positioned by time; drag to move, edges to resize. */
export function SlotsTrack() {
  const { view, clock } = useTimeline();
  const playing = useEditor((s) => s.playing);
  const slots = useEditor(selectSlots);
  const selectedId = useEditor((s) => s.selectedSlotId);
  const select = useEditor((s) => s.select);
  const preview = useEditor((s) => s.dragPreview);
  const autoFilling = useEditor((s) => s.autoFilling);
  const generating = useEditor((s) => s.generating);
  const still = useStill();
  const isReel = useEditor((s) => isReelEngine(s.project));
  // Spec 32 R4.2: picking a graphic while paused shows it (its key moment) in the preview.
  const pick = (slot: Slot) => {
    select(slot.id);
    if (!playing) clock.seek(slotHeroMs(slot));
  };

  if (isReel && slots.length === 0) return <ReelScenesTrack />;
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
        const dragged = preview?.slotId === slot.id ? preview : null;
        const range = dragged ?? slot;
        const left = msToX(range.startMs, view);
        const width = Math.max(8, msToX(range.endMs, view) - left);
        return (
          <SlotCard
            key={slot.id}
            entry={
              slot.id === autoFilling || slot.id === generating?.slotId
                ? { ...slot, status: 'generating' }
                : slot
            }
            {...(slot.id === generating?.slotId ? { phase: generating.phase } : {})}
            selected={slot.id === selectedId}
            width={width}
            className={dragged ? 'z-[3]' : 'z-[2]'}
            style={{ left, transition: dragged?.snapped && !still ? SETTLE : 'none' }}
            onPointerDown={(e) => startSlotDrag(e, slot.id)}
            onClick={(e) => {
              // A drag ends in a click too; only a press that stayed put picks.
              if (e.currentTarget.dataset.dragged === '1') {
                delete e.currentTarget.dataset.dragged;
                return;
              }
              pick(slot);
            }}
            onDoubleClick={() => {
              select(slot.id);
              requestAnimationFrame(() => document.getElementById(INSPECTOR_PROMPT_ID)?.focus());
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                pick(slot);
              }
            }}
          />
        );
      })}
    </>
  );
}
