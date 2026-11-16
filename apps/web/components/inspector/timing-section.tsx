'use client';

import type { Slot } from '@motionpop/schemas';
import { useEffect, useRef, useState } from 'react';
import { Slider } from '@/components/ui/slider';
import { resizeSlot } from '@/lib/commands';
import { limitsFor } from '@/lib/timeline/constraints';
import { editorStore } from '@/lib/stores/editor';
import { Divider, SectionLabel } from './parts';

/**
 * TIMING: label y443, duration slider x83 (190×3), value mono 11 px at x297. The ease picker and
 * the Fade switch sit on the next row (task 14).
 */
export function TimingSection({ slot }: { slot: Slot }) {
  return (
    <section aria-label="Timing">
      <Divider className="mt-3.5" />
      <DurationRow key={`${slot.id}:${slot.startMs}:${slot.endMs}`} slot={slot} />
    </section>
  );
}

function DurationRow({ slot }: { slot: Slot }) {
  const limits = limitsFor(slot.componentId);
  const [draft, setDraft] = useState(slot.endMs - slot.startMs);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  // One undo step per adjustment: commit after the slider rests for 250 ms.
  const onChange = (seconds: number) => {
    const ms = Math.round(seconds * 1000);
    setDraft(ms);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      editorStore.getState().exec(resizeSlot(slot.id, 'end', slot.startMs + ms));
    }, 250);
  };

  return (
    <div className="mt-[13px] flex h-[14px] items-center">
      <SectionLabel className="w-[63px]">Timing</SectionLabel>
      <Slider
        label="Duration"
        value={draft / 1000}
        min={limits.minMs / 1000}
        max={limits.maxMs / 1000}
        step={0.1}
        onChange={onChange}
        format={(v) => `${v.toFixed(1)}s`}
        className="w-[190px]"
      />
      <span className="tabular ml-6 font-mono text-[11px] leading-[14px] text-text">
        {(draft / 1000).toFixed(1)}s
      </span>
    </div>
  );
}
