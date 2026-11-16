'use client';

import { FORMATS } from '@motionpop/schemas';
import { toast } from 'sonner';
import type { Route } from '@/lib/ai/route';
import { getRouter } from '@/lib/ai/router-client';
import { useRoute } from '@/lib/ai/use-route';
import { useCreditsClient } from '@/lib/credits/use-credits-client';
import { useAppConfig } from '@/lib/renders/hooks';
import type { QuickEditOutcome } from '@/lib/slots/quick-edit';
import { beginActivity, endActivity, useAIActivity } from '@/lib/stores/ai-activity';
import { editorStore } from '@/lib/stores/editor';
import { captureRegion, playerSource } from './capture';
import type { Region } from './geometry';
import { runNoteFix, type NoteFixDeps } from './note-fix';
import { regionText } from './region-text';

/**
 * What the preview shows inside a crop, read from the mounted player: the `data-text` elements
 * there and a JPEG when frame capture works (task 19). Each part fails on its own to nothing.
 */
export async function lookAtPreview(
  crop: Region,
): Promise<{ regionText: string[]; image?: string | undefined }> {
  const player = document.querySelector<HTMLElement & { iframeElement?: HTMLIFrameElement | null }>(
    'hyperframes-player',
  );
  const format = editorStore.getState().project?.format ?? '16:9';
  const source = playerSource(player, FORMATS[format]);
  const text = regionText(source.document, crop, source);
  const image = await captureRegion(source, crop);
  return { regionText: text, image };
}

/**
 * Runs `note.fix` with the activity that drives the Pip bubble and the toasts of the outcomes
 * that have no place of their own (the quick edit's set). Returns the outcome so the bubble can
 * show an escalation or a device failure under the note.
 */
export async function runNoteFixWithUi(
  deps: Omit<NoteFixDeps, 'look'> & Partial<Pick<NoteFixDeps, 'look'>>,
  slotId: string,
  noteId: string,
  route: Route,
): Promise<QuickEditOutcome> {
  if (useAIActivity.getState().busy) {
    toast('Pip is on it');
    return { kind: 'blocked', reason: 'Pip is on it' };
  }
  beginActivity('note', slotId);
  let outcome: QuickEditOutcome;
  try {
    outcome = await runNoteFix({ look: lookAtPreview, ...deps }, slotId, noteId, route);
  } catch {
    outcome = route.kind === 'cloud' ? { kind: 'cloud-failed' } : { kind: 'device-failed' };
  }
  if (outcome.kind === 'applied') {
    endActivity({ slotId, ms: outcome.ms });
    return outcome;
  }
  endActivity();
  switch (outcome.kind) {
    case 'cloud-failed':
      toast('Couldn’t fix that note', {
        action: {
          label: 'Retry',
          onClick: () => void runNoteFixWithUi(deps, slotId, noteId, route),
        },
      });
      break;
    case 'changed':
      toast('The graphic changed. Try again.');
      break;
    case 'blocked':
      toast(outcome.reason);
      break;
    default:
      break; // escalate, device-failed: the bubble says it; no-credits: the modal is open
  }
  return outcome;
}

/** The routes and the runner a note bubble needs. */
export function useNoteFix() {
  const route = useRoute('note.fix');
  const cloudRoute = useRoute('note.fix', { forceCloud: true });
  const { client: credits } = useCreditsClient();
  const config = useAppConfig();
  const run = (slotId: string, noteId: string, r: Route = route) =>
    runNoteFixWithUi(
      { store: editorStore, credits, getRouter, config, doc: document },
      slotId,
      noteId,
      r,
    );
  return { route, cloudRoute, run };
}
