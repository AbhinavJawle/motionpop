'use client';

import type { Slot } from '@motionpop/schemas';
import { useEffect, useEffectEvent, useState } from 'react';
import { Button } from '@/components/ui/button';
import { CostChip } from '@/components/ui/chip';
import { Tooltip } from '@/components/ui/tooltip';
import { useAIStatus } from '@/lib/ai/ai-status';
import { getRouter } from '@/lib/ai/router-client';
import { useRoute } from '@/lib/ai/use-route';
import { setSlotPrompt } from '@/lib/commands';
import { schemaFor } from '@/lib/motion/registry';
import { prefillPrompt } from '@/lib/slots/prefill';
import { beginPrefill, endPrefill, useAIActivity } from '@/lib/stores/ai-activity';
import { editorStore } from '@/lib/stores/editor';

/** Prompt box element id, so double-clicking a slot can focus it (spec 04 R6.4). */
export const INSPECTOR_PROMPT_ID = 'inspector-prompt';

/**
 * "Graphic prompt · editable": 72 px, soft body text at 12/18, with "✦ Generate" and the "☁ 3"
 * chip at the bottom right (122×26, 4 px from the bottom, 12 px from the right). The prompt is
 * saved on the slot when the box loses focus (spec 09 R6.1). Generate itself is task 18: until
 * then the button explains why it is off.
 */
export function PromptBox({ slot }: { slot: Slot }) {
  const [draft, setDraft] = useState(slot.prompt);
  const route = useRoute('generate');
  const prefill = usePrefill(slot);
  const prefilling = prefill === 'working';
  const planned = schemaFor(slot.componentId) === undefined;
  const cost = route.kind === 'cloud' ? route.credits : 3;
  const tip = planned
    ? 'Coming soon'
    : route.kind === 'disabled'
      ? route.reason
      : 'Cloud generation is on its way';

  const save = () => {
    const next = draft.trim();
    if (next === slot.prompt.trim()) return;
    editorStore.getState().exec(setSlotPrompt(slot.id, next));
  };

  return (
    <div className="relative mt-2 h-[72px] rounded-chip bg-card shadow-glass">
      <textarea
        id={INSPECTOR_PROMPT_ID}
        aria-label="Graphic prompt"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        maxLength={500}
        className="h-full w-full resize-none bg-transparent px-3 pt-[9px] pb-8 text-xs leading-[18px] text-text-body outline-none placeholder:text-text-4"
        placeholder={
          prefilling ? 'Pip is writing a prompt…' : 'Describe the graphic you want here…'
        }
      />
      <Tooltip content={tip} side="top" className="absolute right-3 bottom-1">
        <span>
          <Button
            variant="ai"
            size="sm"
            disabled
            className="h-[26px] w-[122px] gap-0 pr-[7px] pl-[11px]"
          >
            <span>✦ Generate</span>
            <CostChip route="cloud" credits={cost} className="ml-auto" />
          </Button>
        </span>
      </Tooltip>
    </div>
  );
}

/**
 * Fills an empty prompt (spec 09 R6.1): once the on-device status is known, `prompt.prefill` on
 * the device or the template, never the cloud. The box remounts when the saved prompt changes, so
 * the new text appears by itself.
 */
function usePrefill(slot: Slot): 'idle' | 'working' {
  const route = useRoute('prompt.prefill');
  const { availability } = useAIStatus();
  const empty = slot.prompt.trim() === '';
  const settled = availability !== 'checking';
  const working = useAIActivity((s) => s.prefilling.includes(slot.id));
  const run = useEffectEvent(async () => {
    // Taken once per slot, so a double effect (Strict Mode) never runs it twice.
    if (!beginPrefill(slot.id)) return;
    try {
      await prefillPrompt({ store: editorStore, getRouter }, slot.id, route);
    } finally {
      endPrefill(slot.id);
    }
  });
  useEffect(() => {
    if (empty && settled) void run();
  }, [empty, settled, slot.id]);
  return working ? 'working' : 'idle';
}
