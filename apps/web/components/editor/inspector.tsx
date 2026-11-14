'use client';

import type { Slot } from '@motionpop/schemas';
import { ChevronDown, MoreHorizontal } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { CostChip } from '@/components/ui/chip';
import { Slider } from '@/components/ui/slider';
import { Tooltip } from '@/components/ui/tooltip';
import { resizeSlot } from '@/lib/commands';
import { styleFor } from '@/lib/composition/project-to-compile';
import { componentName, formatClock, spokenText } from '@/lib/editor/slot-display';
import { springSoft } from '@/lib/motion/presets';
import { limitsFor } from '@/lib/timeline/constraints';
import { selectSelectedSlot, selectWords, useEditor } from '@/lib/stores/editor';

/** Prompt box element id, so double-clicking a slot can focus it (spec 04 R6.4). */
export const INSPECTOR_PROMPT_ID = 'inspector-prompt';

/**
 * Graphic inspector, 360 px, shown while a slot is selected (spec 04 R3.4). Content, versions
 * and quick edits are spec 09; Generate is spec 06.
 */
export function Inspector() {
  const slot = useEditor(selectSelectedSlot);
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
          className="shrink-0 overflow-hidden border-l border-white/6 bg-panel"
        >
          <div className="h-full w-[360px] overflow-y-auto px-5 pt-3 pb-5">
            <InspectorBody slot={slot} />
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

function InspectorBody({ slot }: { slot: Slot }) {
  const words = useEditor(selectWords);
  const slotNumber = useEditor(
    (s) => s.project?.slots.filter((x) => x.startMs <= slot.startMs).length ?? 0,
  );
  const styleName = useEditor((s) => (s.project ? styleFor(s.project).name : ''));
  const said = spokenText(slot, words);
  const name = componentName(slot.componentId);

  return (
    <>
      <p className="text-[10px] leading-[13px] font-medium tracking-[1.1px] text-text-3">GRAPHIC</p>
      <div className="mt-[3px] flex items-center justify-between">
        <h2 className="text-[17px] leading-[22px] font-semibold">
          Slot {slotNumber} · {name}
        </h2>
        <button
          type="button"
          aria-label="Slot actions"
          className="-mr-1 rounded-md p-1 text-text-2 hover:bg-card hover:text-text"
        >
          <MoreHorizontal className="size-4" strokeWidth={1.5} />
        </button>
      </div>
      <p className="mt-0.5 font-mono text-[11px] leading-[14px] text-text-2">
        {formatClock(slot.startMs)} – {formatClock(slot.endMs)}
      </p>

      <div className="relative mt-1.5 rounded-chip bg-reason py-1.5 pr-3 pl-3 shadow-glass">
        <span aria-hidden className="absolute top-2 left-0 h-7 w-0.5 rounded-full bg-violet" />
        <p className="text-[10px] leading-[13px] font-medium text-violet-ink-2">You said</p>
        <p className="mt-1 truncate text-xs leading-4 text-text-body">
          {said ? `“${said}”` : slot.reason}
        </p>
      </div>

      <PromptBox key={`${slot.id}:${slot.prompt}`} slot={slot} />

      <div className="mt-2 flex h-8 items-center justify-between rounded-lg bg-card pr-1.5 pl-2.5 shadow-glass">
        <span className="text-[10px] leading-[13px] text-text-3">
          Quick edit… e.g. make it slower
        </span>
        <CostChip route="device" />
      </div>

      <hr className="mt-2.5 border-white/6" />
      <div className="flex h-[38px] items-center justify-between">
        <span className="label-caps text-[10px]">Content</span>
        <ChevronDown className="size-3 text-text-3" strokeWidth={1.5} aria-hidden />
      </div>

      <div className="flex h-9 items-center gap-3">
        <span className="label-caps w-12 text-[10px]">Style</span>
        <span className="text-[11px] leading-[14px] text-style-ink">{styleName}</span>
      </div>

      <hr className="mt-2 border-white/6" />
      <TimingRow key={`${slot.id}:${slot.startMs}:${slot.endMs}`} slot={slot} />
    </>
  );
}

function PromptBox({ slot }: { slot: Slot }) {
  const [draft, setDraft] = useState(slot.prompt);
  return (
    <div className="relative mt-2 h-[72px] rounded-chip bg-card shadow-glass">
      <textarea
        id={INSPECTOR_PROMPT_ID}
        aria-label="Graphic prompt"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        className="h-full w-full resize-none bg-transparent px-3 pt-2.5 pb-8 text-xs leading-4 text-text-body outline-none placeholder:text-text-4"
        placeholder="Describe the graphic you want here…"
      />
      <Tooltip content="Cloud generation is on its way" side="top">
        <span className="absolute right-3 bottom-[8px]">
          <Button
            variant="ai"
            size="sm"
            disabled
            className="h-[26px] w-[122px] gap-0 pr-1 pl-[11px]"
          >
            <span>✦ Generate</span>
            <CostChip route="cloud" credits={3} className="ml-auto" />
          </Button>
        </span>
      </Tooltip>
    </div>
  );
}

function TimingRow({ slot }: { slot: Slot }) {
  const exec = useEditor((s) => s.exec);
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
      exec(resizeSlot(slot.id, 'end', slot.startMs + ms));
    }, 250);
  };

  return (
    <div className="mt-3 flex items-center gap-[25px]">
      <span className="label-caps w-10 text-[10px]">Timing</span>
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
      <span className="ml-auto font-mono text-[11px] leading-[14px] text-text">
        {(draft / 1000).toFixed(1)}s
      </span>
    </div>
  );
}
