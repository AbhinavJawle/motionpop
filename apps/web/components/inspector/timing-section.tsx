'use client';

import type { Slot } from '@motionpop/schemas';
import { useEffect, useRef, useState } from 'react';
import { Slider } from '@/components/ui/slider';
import { Toggle } from '@/components/ui/toggle';
import { Tooltip } from '@/components/ui/tooltip';
import { resizeSlot, setSlotTiming } from '@/lib/commands';
import { styleFor } from '@/lib/composition/project-to-compile';
import { effectiveEase, fadePatch } from '@/lib/inspector/timing-view';
import { isScene } from '@/lib/motion/registry';
import { editorStore, useEditor } from '@/lib/stores/editor';
import { limitsFor } from '@/lib/timeline/constraints';
import { EasePicker } from './ease-picker';
import { Divider, SectionLabel } from './parts';

/**
 * TIMING (spec 09 R4): the duration slider (label y443, slider x83 190×3, value mono 11 px at
 * x297), then the ease picker and the Fade switch on the next row (y466). Ease and Fade are
 * stored on the slot as `timing` and undo like any command.
 */
export function TimingSection({ slot }: { slot: Slot }) {
  return (
    <section aria-label="Timing">
      <Divider className="mt-3.5" />
      <DurationRow key={`${slot.id}:${slot.startMs}:${slot.endMs}`} slot={slot} />
      <EaseFadeRow slot={slot} />
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

function EaseFadeRow({ slot }: { slot: Slot }) {
  const look = useEditor((s) => (s.project ? styleFor(s.project) : null));
  const scene = isScene(slot.componentId);
  const ease = look ? effectiveEase(slot.timing, look) : 'inOut';
  // Library components always play their own exit; only scenes can hold and cut (R4.3, D-039).
  const fade = scene ? slot.timing?.fade !== false : true;
  const run = (patch: Parameters<typeof setSlotTiming>[1]) =>
    editorStore.getState().exec(setSlotTiming(slot.id, patch));

  return (
    <div className="mt-[9px] flex h-[25px] items-center">
      <EasePicker
        value={ease}
        own={slot.timing?.ease !== undefined}
        onChange={(next) => run({ ease: next })}
      />
      <span className="ml-5 text-[10px] leading-[13px] text-text-2">Fade</span>
      <Tooltip
        content={scene ? 'Off holds the last frame and cuts' : 'This graphic always fades out'}
        side="top"
        className="ml-[10px]"
      >
        <Toggle
          label="Fade"
          checked={fade}
          disabled={!scene}
          className="disabled:opacity-70"
          onCheckedChange={(on) => run(fadePatch(on))}
        />
      </Tooltip>
    </div>
  );
}
