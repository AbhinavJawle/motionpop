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
import { useCustom } from '@/lib/slots/use-custom';
import { useGenerate } from '@/lib/slots/use-generate';
import { prefillPrompt } from '@/lib/slots/prefill';
import { beginPrefill, endPrefill, useAIActivity } from '@/lib/stores/ai-activity';
import { editorStore } from '@/lib/stores/editor';

/**
 * The prompt saves on blur and the box remounts when the saved prompt changes, so a press that
 * moved focus away first would remount the button under the pointer and lose the click. The
 * click handlers save the draft themselves.
 */
const keepFocus = (e: { preventDefault: () => void }) => e.preventDefault();

/** Prompt box element id, so double-clicking a slot can focus it (spec 04 R6.4). */
export const INSPECTOR_PROMPT_ID = 'inspector-prompt';

/**
 * "Graphic prompt · editable": 72 px, soft body text at 12/18, with "✦ Generate" and the "☁ 3"
 * chip at the bottom right (122×26, 4 px from the bottom, 12 px from the right). The prompt is
 * saved on the slot when the box loses focus (spec 09 R6.1). Generate runs the cloud fill for 3
 * credits (R6.2); when it can't, the tooltip says why (R6.3, R6.8). A click saves the draft first,
 * so the model reads what is on screen.
 */
export function PromptBox({ slot }: { slot: Slot }) {
  const [draft, setDraft] = useState(slot.prompt);
  const gen = useGenerate(slot);
  const custom = useCustom(slot);
  const prefill = usePrefill(slot);
  const prefilling = prefill === 'working';
  const cost = gen.route.kind === 'cloud' ? gen.route.credits : 3;

  const save = () => {
    const next = draft.trim();
    if (next === slot.prompt.trim()) return;
    editorStore.getState().exec(setSlotPrompt(slot.id, next));
  };
  const generate = () => {
    save();
    gen.run();
  };
  const makeCustom = () => {
    save();
    custom.run();
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
      {/* Tier 2 (spec 15, not designed): the same brief, written as a new graphic by the cloud. */}
      <Tooltip
        content={
          custom.disabledReason ??
          (custom.filmBeat
            ? 'Pip rebuilds this beat from the film’s storyboard, with your prompt as its picture'
            : 'Nothing in the library fits? Pip writes a custom graphic')
        }
        side="top"
        className="absolute bottom-1 left-2"
      >
        <span>
          <Button
            variant="ghost"
            size="sm"
            disabled={custom.disabledReason !== null || gen.busy || draft.trim().length < 3}
            onMouseDown={keepFocus}
            onClick={makeCustom}
            className="h-[26px] gap-1 px-2 text-violet-ink"
          >
            <span>{custom.filmBeat ? 'Rebuild beat' : 'Custom'}</span>
            <CostChip route="cloud" credits={custom.cost} />
          </Button>
        </span>
      </Tooltip>
      <Tooltip
        content={gen.disabledReason ?? 'Generate with cloud AI'}
        shortcut={gen.disabledReason ? undefined : '⌘G'}
        side="top"
        className="absolute right-3 bottom-1"
      >
        <span>
          <Button
            variant="ai"
            size="sm"
            disabled={gen.disabledReason !== null || gen.busy}
            onMouseDown={keepFocus}
            onClick={generate}
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
