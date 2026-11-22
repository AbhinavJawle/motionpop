'use client';

import { costOf } from '@motionpop/schemas';
import { toast } from 'sonner';
import type { Route } from '@/lib/ai/route';
import { getRouter } from '@/lib/ai/router-client';
import { useRoute } from '@/lib/ai/use-route';
import { useCreditsClient } from '@/lib/credits/use-credits-client';
import type { Region } from '@/lib/notes/geometry';
import { useAppConfig } from '@/lib/renders/hooks';
import { beginActivity, endActivity, useAIActivity } from '@/lib/stores/ai-activity';
import { editorStore } from '@/lib/stores/editor';
import { customPictures, loadReelCustomAssets } from './custom-assets';
import { resolveReelMedia } from './media';
import { runReelNoteFix, type ReelNoteFixDeps, type ReelNoteOutcome } from './note-fix';
import { captureReelRegion, readReelTarget, reelStage, type ReelTarget } from './note-look';

/** What the reel preview shows under a note: the parts, texts and pictures, and a JPEG crop. */
export async function lookAtReel(
  region: Region,
  crop: Region,
  sceneId: string,
): Promise<{ target: ReelTarget; image?: string }> {
  // The caller may just have moved the playhead to the note's time: let the stage draw it.
  if (typeof requestAnimationFrame === 'function') {
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  }
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
  // A new graphic takes a while: one toast follows its steps.
  let stageToast: string | number | null = null;
  const STAGES = {
    compose: 'Pip is writing a new graphic…',
    check: 'Pip is checking the graphic…',
    repair: 'Pip is polishing the graphic…',
  } as const;
  try {
    outcome = await runReelNoteFix(
      {
        look: lookAtReel,
        onPictures: (n) => {
          // The scene changed while the picture was on its way: nothing to say.
          if (n === null) return;
          if (n > 0) toast.success(n === 1 ? 'Picture added' : `${n} pictures added`);
          else toast('Couldn’t find that picture. The design fallback stays.');
        },
        customAssets: loadReelCustomAssets,
        customPictures: (ids) => customPictures(ids, editorStore.getState().project?.assets),
        onStage: (stage) => {
          stageToast = toast.loading(STAGES[stage], stageToast === null ? {} : { id: stageToast });
        },
        ...deps,
      },
      sceneId,
      noteId,
      route,
    );
  } catch {
    outcome = { kind: 'cloud-failed' };
  }
  if (stageToast !== null && !(outcome.kind === 'applied' && outcome.composed))
    toast.dismiss(stageToast);
  if (outcome.kind === 'applied') {
    endActivity({ slotId: sceneId, ms: outcome.ms });
    if (outcome.composed)
      toast.success('New graphic ready', stageToast === null ? {} : { id: stageToast });
    if (outcome.pictures > 0) toast('Fetching the picture…');
    return outcome;
  }
  endActivity();
  switch (outcome.kind) {
    case 'cloud-failed':
      // The retry lives on the note ("Fix again"), which also shows the result when it lands.
      toast('Couldn’t fix that note. Try “Fix again” on it.');
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

/**
 * The route and the runner a reel note bubble needs. Reel notes run on the strong cloud model
 * (spec 30): 1 credit, plus the custom price when the note needs a new motion graphic.
 */
export function useReelNoteFix() {
  const cloudRoute = useRoute('note.fix', { forceCloud: true });
  const route = cloudRoute;
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
  const note = costOf('edit', 1, config);
  const custom = costOf('custom', 1, config);
  // A fix may also fetch one new illustration (`maxIllustrations: 1` below): it is in the range.
  const image = costOf('image', 1, config);
  const cost = {
    label: `${note}–${note + custom + image}`,
    hint: `${note} credit for the note, ${custom} more if Pip writes a new graphic, ${image} for a new illustration`,
  };
  return { route, cloudRoute, cost, run };
}
