'use client';

import type { Slot } from '@motionpop/schemas';
import { useMemo } from 'react';
import { Pip } from '@/components/pip/pip';
import { StepCard } from '@/components/processing/step-card';
import { slotCardText } from '@/lib/editor/slot-display';
import { selectSlots, useEditor } from '@/lib/stores/editor';
import { Divider } from './parts';

/**
 * The inspector while a Generate runs (spec 09 R1.3, R6.4; `editor-generating.png`): "MOTION IN
 * THE MAKING", "Bringing it to life", Pip with sparkles, the three step cards (the first two are
 * done by the time the call starts), "YOUR NEXT MOMENT" and the "Keep your ideas moving." card.
 * The user can select other slots meanwhile; this panel is only for the slot being generated.
 */
export function GeneratingPanel({ slot }: { slot: Slot }) {
  const slotNumber = useEditor(
    (s) => s.project?.slots.filter((x) => x.startMs <= slot.startMs).length ?? 0,
  );
  // Select the stable `slots` array and derive in a memo: a fresh object from the selector would
  // make the store re-render this component forever.
  const slots = useEditor(selectSlots);
  const next = useMemo(() => {
    const i = slots.findIndex((x) => x.id === slot.id);
    const after = slots.slice(i + 1).find((x) => x.status !== 'ready');
    return after ? { slot: after, number: slots.indexOf(after) + 1 } : null;
  }, [slots, slot.id]);
  return (
    <div role="status" aria-label="Generating this graphic">
      <div className="relative -mx-5 px-5">
        <p className="pt-4 text-[10px] leading-[13px] font-medium tracking-[1.1px] text-section uppercase">
          Motion in the making
        </p>
        <h2 className="mt-[11px] text-[19px] leading-6 font-semibold tracking-[-0.2px]">
          Bringing it to life
        </h2>
        <p className="mt-[8px] text-xs leading-4 text-text-2">A few moments. A little magic.</p>
        <div className="pointer-events-none absolute top-[8px] right-1">
          <Pip state="idle" props={['sparkles']} size={64} decorative seed={11} />
        </div>
      </div>
      <Divider className="mt-[25px]" soft />
      <ol className="mt-[22px] flex flex-col gap-3" aria-label="Steps">
        <StepCard index={1} title="Finding moments" state="done" />
        <StepCard index={2} title="Choosing graphics" state="done" />
        <StepCard index={3} title={`Animating slot ${slotNumber}`} state="active" />
      </ol>
      <Divider className="mt-8" soft />
      {next && (
        <div className="mt-[22px]">
          <p className="text-[10px] leading-[13px] font-medium tracking-[1.1px] text-section uppercase">
            Your next moment
          </p>
          <p className="mt-[10px] text-sm leading-[18px] font-medium text-text">
            Slot {next.number} · {slotCardText(next.slot).title.replace(/…$/, '')}
          </p>
          <p className="mt-[10px] text-xs leading-4 text-text-2">
            Matching the motion to your words.
          </p>
        </div>
      )}
      <div className="mt-[34px] rounded-chip bg-card/70 px-3.5 py-3 shadow-quiet">
        <p className="text-[13px] leading-[17px] font-medium text-violet-ink">
          Keep your ideas moving.
        </p>
        <p className="mt-1 text-[11px] leading-[14px] text-text-3">
          You can keep editing while Pip works.
        </p>
      </div>
    </div>
  );
}
