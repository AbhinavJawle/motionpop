'use client';

import { toast } from 'sonner';
import type { Route } from '@/lib/ai/route';
import { getRouter } from '@/lib/ai/router-client';
import { useRoute } from '@/lib/ai/use-route';
import { useCreditsClient } from '@/lib/credits/use-credits-client';
import type { Region } from '@/lib/notes/geometry';
import { useAppConfig } from '@/lib/renders/hooks';
import { beginActivity, endActivity, useAIActivity } from '@/lib/stores/ai-activity';
import { editorStore } from '@/lib/stores/editor';
import { resolveReelMedia } from './media';
import { runReelNoteFix, type ReelNoteFixDeps, type ReelNoteOutcome } from './note-fix';
import { captureReelRegion, readReelTarget, reelStage, type ReelTarget } from './note-look';

/** What the reel preview shows under a note: the parts, texts and pictures, and a JPEG crop. */
export async function lookAtReel(
  region: Region,
  crop: Region,
  sceneId: string,
): Promise<{ target: ReelTarget; image?: string }> {
  const stage = reelStage();
  const reel = editorStore.getState().project?.reel;
  if (!stage || !reel) return { target: { parts: [], texts: [], pictures: [] } };
  const target = readReelTarget(stage, region, reel, sceneId);
  const image = await captureReelRegion(stage, crop);
  return image ? { target, image } : { target };
}

/**
 * Runs a reel note with the activity that drives the Pip bubble and the preview badge, and the
 * toasts of the outcomes that have no place in the bubble (spec 29 R5).
 */
export async function runReelNoteFixWithUi(
  deps: Omit<ReelNoteFixDeps, 'look'> & Partial<Pick<ReelNoteFixDeps, 'look'>>,
  sceneId: string,
  noteId: string,
  route: Route,
): Promise<ReelNoteOutcome> {
  if (useAIActivity.getState().busy) {
    toast('Pip is on it');
    return { kind: 'blocked', reason: 'Pip is on it' };
  }
  beginActivity('note', sceneId);
  let outcome: ReelNoteOutcome;
  try {
    outcome = await runReelNoteFix(
      {
        look: lookAtReel,
        onPictures: (n) => {
          if (n > 0) toast.success(n === 1 ? 'Picture added' : `${n} pictures added`);
          else toast('Couldn’t find that picture. The design fallback stays.');
        },
        ...deps,
      },
      sceneId,
      noteId,
      route,
    );
  } catch {
    outcome = route.kind === 'cloud' ? { kind: 'cloud-failed' } : { kind: 'device-failed' };
  }
  if (outcome.kind === 'applied') {
    endActivity({ slotId: sceneId, ms: outcome.ms });
    if (outcome.pictures > 0) toast('Fetching the picture…');
    return outcome;
  }
  endActivity();
  switch (outcome.kind) {
    case 'cloud-failed':
      toast('Couldn’t fix that note', {
        action: {
          label: 'Retry',
          onClick: () => void runReelNoteFixWithUi(deps, sceneId, noteId, route),
        },
      });
      break;
    case 'changed':
      toast('The scene changed while Pip worked. Try again.');
      break;
    case 'blocked':
      toast(outcome.reason);
      break;
    default:
      break; // escalate, device-failed: the bubble says it; no-credits: the modal is open
  }
  return outcome;
}

/** The routes and the runner a reel note bubble needs (same routing as notes on graphics). */
export function useReelNoteFix() {
  const route = useRoute('note.fix');
  const cloudRoute = useRoute('note.fix', { forceCloud: true });
  const { client: credits } = useCreditsClient();
  const config = useAppConfig();
  const run = (sceneId: string, noteId: string, r: Route = route) =>
    runReelNoteFixWithUi(
      {
        store: editorStore,
        credits,
        getRouter,
        config,
        fetchMedia: (plan, look) => {
          const p = editorStore.getState().project;
          return resolveReelMedia(plan, look, p?.id ?? 'reel', {
            credits,
            config,
            existing: p?.assets ?? [],
            maxIllustrations: 1,
          });
        },
      },
      sceneId,
      noteId,
      r,
    );
  return { route, cloudRoute, run };
}
