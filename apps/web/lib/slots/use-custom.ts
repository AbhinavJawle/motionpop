'use client';

import type { Slot } from '@motionpop/schemas';
import { toast } from 'sonner';
import { getRouter } from '@/lib/ai/router-client';
import type { Route } from '@/lib/ai/route';
import { useRoute } from '@/lib/ai/use-route';
import { useCreditsClient } from '@/lib/credits/use-credits-client';
import { useAppConfig } from '@/lib/renders/hooks';
import { beginActivity, endActivity, useAIActivity } from '@/lib/stores/ai-activity';
import { editorStore, useEditor } from '@/lib/stores/editor';
import { COULDNT_CUSTOM, generateCustom } from './custom';
import { PIP_IS_ON_IT, type GenerateDeps } from './generate';

/** One custom graphic with the same activity, badge and toasts as Generate (spec 15 R1). */
export async function runCustom(deps: GenerateDeps, slotId: string, route: Route): Promise<void> {
  if (useAIActivity.getState().busy || deps.store.getState().generating) {
    toast(PIP_IS_ON_IT);
    return;
  }
  beginActivity('generate', slotId);
  let result;
  try {
    result = await generateCustom(deps, slotId, route);
  } catch {
    result = { outcome: 'kept' as const, reason: COULDNT_CUSTOM };
  }
  if (result.outcome === 'ready' && result.ms !== undefined) {
    endActivity({ slotId, ms: result.ms });
    toast.success(`Custom graphic ready in ${(result.ms / 1000).toFixed(1)}s`);
    return;
  }
  endActivity();
  if (result.outcome === 'kept') {
    toast(result.reason ?? COULDNT_CUSTOM, {
      action: { label: 'Retry', onClick: () => void runCustom(deps, slotId, route) },
    });
  } else if (result.outcome === 'discarded') toast('The graphic changed. Try again.');
  else if (result.outcome === 'blocked' && result.reason) toast(result.reason);
}

export function useCustom(slot: Slot | null) {
  const route = useRoute('custom.compose');
  const { client: credits } = useCreditsClient();
  const config = useAppConfig();
  const generating = useEditor((s) => s.generating);
  const disabledReason =
    slot === null
      ? 'Select a graphic first'
      : generating
        ? PIP_IS_ON_IT
        : route.kind === 'disabled'
          ? route.reason
          : null;
  const run = () => {
    if (!slot || disabledReason !== null) return;
    void runCustom({ store: editorStore, credits, getRouter, config }, slot.id, route);
  };
  return { route, disabledReason, run, cost: route.kind === 'cloud' ? route.credits : 3 };
}
