'use client';

import type { Slot } from '@motionpop/schemas';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { getRouter } from '@/lib/ai/router-client';
import type { Route } from '@/lib/ai/route';
import { useRoute } from '@/lib/ai/use-route';
import { useCreditsClient } from '@/lib/credits/use-credits-client';
import { useAppConfig } from '@/lib/renders/hooks';
import { schemaFor } from '@/lib/motion/registry';
import { beginActivity, endActivity, useAIActivity } from '@/lib/stores/ai-activity';
import { editorStore, useEditor } from '@/lib/stores/editor';
import { recordGenerateMs } from './generate-timing';
import { COULDNT_GENERATE, generateSlot, PIP_IS_ON_IT, type GenerateDeps } from './generate';

/**
 * Runs one Generate with the screen around it (spec 09 R6): the activity that drives the Pip
 * bubble and the "Generating…" badge, the measured time for the badge and the progress line, and
 * the toasts for the outcomes that have no panel of their own.
 */
export async function runGenerate(deps: GenerateDeps, slotId: string, route: Route): Promise<void> {
  if (useAIActivity.getState().busy || deps.store.getState().generating) {
    toast(PIP_IS_ON_IT);
    return;
  }
  beginActivity('generate', slotId);
  let result;
  try {
    result = await generateSlot(deps, slotId, route);
  } catch {
    result = { outcome: 'kept' as const };
  }
  if (result.outcome === 'ready' && result.ms !== undefined) {
    recordGenerateMs(result.ms);
    endActivity({ slotId, ms: result.ms });
    return;
  }
  endActivity();
  switch (result.outcome) {
    case 'kept':
      toast(COULDNT_GENERATE, {
        action: { label: 'Retry', onClick: () => void runGenerate(deps, slotId, route) },
      });
      break;
    case 'discarded':
      toast('The graphic changed. Try again.');
      break;
    case 'blocked':
      if (result.reason) toast(result.reason);
      break;
    case 'failed':
    case 'no-credits':
    case 'ready':
      break; // the failed slot shows its own state; the out-of-credits modal is open
  }
}

export interface UseGenerate {
  route: Route;
  /** Why the button is off, or null. */
  disabledReason: string | null;
  /** This slot is the one being generated. */
  busy: boolean;
  run: () => void;
}

/** What the Generate button of a slot needs: its route, why it may be off, and the click. */
export function useGenerate(slot: Slot | null): UseGenerate {
  const route = useRoute('generate');
  const { client: credits } = useCreditsClient();
  const config = useAppConfig();
  const generating = useEditor((s) => s.generating);
  const planned = slot ? schemaFor(slot.componentId) === undefined : false;
  const busy = generating !== null && generating.slotId === slot?.id;
  const disabledReason =
    slot === null
      ? 'Select a graphic first'
      : planned
        ? 'Coming soon'
        : generating
          ? PIP_IS_ON_IT
          : route.kind === 'disabled'
            ? route.reason
            : null;
  const run = () => {
    if (!slot || disabledReason !== null) return;
    void runGenerate(
      { store: editorStore, credits, getRouter, config, doc: document },
      slot.id,
      route,
    );
  };
  return { route, disabledReason, busy, run };
}

/** ⌘G (Ctrl+G) generates the selected slot (the timeline's hint says so). Mount once in the editor. */
export function useGenerateShortcut(): void {
  const slot = useEditor((s) => s.project?.slots.find((x) => x.id === s.selectedSlotId) ?? null);
  const gen = useGenerate(slot);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'g')
        return;
      e.preventDefault(); // the browser's "find next"
      if (!slot) return;
      if (gen.disabledReason === PIP_IS_ON_IT) toast(PIP_IS_ON_IT);
      else if (gen.disabledReason) toast(gen.disabledReason);
      else gen.run();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
}
