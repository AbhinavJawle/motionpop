import {
  applyReelNote,
  reelNoteContext,
  reelNoteInput,
  runReelNote,
  type Router,
} from '@motionpop/ai';
import {
  APP_CONFIG_DEFAULTS,
  reelMediaOf,
  reelSceneData,
  type AppConfig,
  type ImageAsset,
  type ReelLook,
  type ReelPlan,
  type ReelScene,
} from '@motionpop/schemas';
import type { Route } from '@/lib/ai/route';
import { composite, fixReelScene, setReel, setReelNoteStatus } from '@/lib/commands';
import { newSpendKey, type CreditsClient } from '@/lib/credits/client';
import { spendWithUi } from '@/lib/credits/spend-with-ui';
import { cropRect, regionOf, type Region } from '@/lib/notes/geometry';
import { jpegBase64 } from '@/lib/notes/note-fix';
import type { EditorStore } from '@/lib/stores/editor';
import type { ReelTarget } from './note-look';

/**
 * Frame note → `reel.note` (spec 29 R4): routed, charged and refunded exactly like a note on a
 * graphic (spec 09): the device is free and never falls back to the cloud by itself; the cloud
 * costs 1 credit, reserved first and returned whenever nothing is applied. The fix is one undo
 * step (the scene, the hook, the caption words and the note's status). Pictures the fix asks for
 * are fetched afterwards and land as a second step, so the edit shows at once.
 */
export type ReelNoteOutcome =
  | { kind: 'applied'; ms: number; ranOn: 'device' | 'cloud'; message: string; pictures: number }
  | { kind: 'escalate'; message: string }
  | { kind: 'device-failed' }
  | { kind: 'cloud-failed' }
  | { kind: 'changed' }
  | { kind: 'blocked'; reason: string }
  | { kind: 'no-credits' };

export interface ReelNoteFixDeps {
  store: EditorStore;
  credits: CreditsClient | null;
  getRouter: () => Promise<Router | null>;
  /** What the preview shows under the note's region and a JPEG of the crop, when it can. */
  look: (
    region: Region,
    crop: Region,
    sceneId: string,
  ) => Promise<{ target: ReelTarget; image?: string }>;
  /** Fetches the pictures a one-scene plan asks for (`resolveReelMedia`). */
  fetchMedia?: (
    plan: ReelPlan,
    look: ReelLook,
  ) => Promise<{ plan: ReelPlan; assets: ImageAsset[] }>;
  config?: Pick<AppConfig, 'creditCosts' | 'imageCredits' | 'exportCredits'>;
  newKey?: () => string;
  /** Called when the pictures of an applied fix have landed (or failed). */
  onPictures?: (landed: number) => void;
}

const sceneJson = (s: ReelScene | undefined) => (s ? JSON.stringify(reelSceneData(s)) : '');

export async function runReelNoteFix(
  deps: ReelNoteFixDeps,
  sceneId: string,
  noteId: string,
  route: Route,
): Promise<ReelNoteOutcome> {
  if (route.kind === 'disabled') return { kind: 'blocked', reason: route.reason };
  if (route.kind === 'local') return { kind: 'blocked', reason: 'Needs on-device AI' };
  const project = deps.store.getState().project;
  const reel = project?.reel;
  const index = reel?.scenes.findIndex((s) => s.id === sceneId) ?? -1;
  const scene = reel?.scenes[index];
  const note = scene?.notes?.find((n) => n.id === noteId);
  if (!project || !reel || !scene || !note) return { kind: 'changed' };
  const text = note.text.trim();
  if (text === '') return { kind: 'blocked', reason: 'Type what to change' };

  let txId: string | null = null;
  if (route.kind === 'cloud') {
    if (!deps.credits) return { kind: 'blocked', reason: 'Sign in to use cloud AI' };
    const spent = await spendWithUi(
      deps.credits,
      { action: 'edit', key: (deps.newKey ?? newSpendKey)(), refId: sceneId },
      deps.config ?? APP_CONFIG_DEFAULTS,
    );
    if (spent === null) return { kind: 'no-credits' };
    if (!spent.ok) {
      return spent.reason === 'insufficient'
        ? { kind: 'no-credits' }
        : { kind: 'blocked', reason: 'Couldn’t reserve the credit' };
    }
    txId = spent.txId;
  }
  const refund = async () => {
    if (txId && deps.credits) await deps.credits.refund(txId).catch(() => undefined);
  };
  const failed = (): ReelNoteOutcome =>
    route.kind === 'cloud' ? { kind: 'cloud-failed' } : { kind: 'device-failed' };

  const router = await deps.getRouter().catch(() => null);
  if (!router) {
    await refund();
    return failed();
  }

  // The reel is always 9:16.
  const region = regionOf(note.shape, 9 / 16);
  const seen: { target: ReelTarget; image?: string | undefined } = await deps
    .look(region, cropRect(region), sceneId)
    .catch(() => ({ target: { parts: [], texts: [], pictures: [] } }));
  const words = project.transcript.words.map((w) => ({
    text: w.text,
    startMs: w.startMs,
    endMs: w.endMs,
  }));
  const ctx = reelNoteContext(scene, words, reel.look);
  const showsHook = index === 0 && reel.hook !== undefined && reel.look === 'mono';
  const image = jpegBase64(seen.image);
  let input;
  try {
    input = reelNoteInput(ctx, {
      sceneIndex: index,
      sceneCount: reel.scenes.length,
      note: { text: text.slice(0, 300), region },
      target: seen.target,
      caption: seen.target.caption,
      hook: showsHook ? reel.hook : undefined,
      image,
    });
  } catch {
    await refund();
    return failed();
  }

  let res;
  try {
    res = await runReelNote(
      router,
      input,
      route.kind === 'cloud' ? 'ONLY_IN_CLOUD' : 'ONLY_ON_DEVICE',
    );
  } catch {
    await refund();
    return failed();
  }

  // The scene or the note moved on while the model worked: never overwrite what the user did.
  const nowReel = deps.store.getState().project?.reel;
  const nowScene = nowReel?.scenes.find((s) => s.id === sceneId);
  const nowNote = nowScene?.notes?.find((n) => n.id === noteId);
  if (
    !nowReel ||
    !nowScene ||
    !nowNote ||
    nowNote.status !== 'open' ||
    sceneJson(nowScene) !== sceneJson(scene) ||
    nowReel.hook !== reel.hook ||
    nowReel.look !== reel.look
  ) {
    await refund();
    return { kind: 'changed' };
  }

  let result;
  try {
    result = applyReelNote(ctx, res.output, { hook: showsHook ? reel.hook : undefined });
  } catch {
    await refund();
    return failed();
  }
  if (!result.changed) {
    await refund();
    return {
      kind: 'escalate',
      message: result.message || 'Pip couldn’t change that here. Try saying it another way.',
    };
  }

  const ok = deps.store.getState().exec(
    composite('Fix note', [
      fixReelScene(sceneId, {
        scene: result.scene,
        ...(result.hook !== undefined ? { hook: result.hook } : {}),
        ...(result.captions.length ? { captions: result.captions } : {}),
      }),
      setReelNoteStatus(sceneId, noteId, 'fixed'),
    ]),
  );
  if (!ok) {
    await refund();
    return failed();
  }

  // New pictures (a different logo, a new subject) are fetched now and land as a second step.
  const wanted = reelMediaOf({ scenes: [result.scene] }).filter((m) => !m.asset);
  if (wanted.length && deps.fetchMedia) {
    void fetchPictures(deps, sceneId, result.scene).then((n) => deps.onPictures?.(n));
  }
  const ranOn = res.ranOn === 'cloud' ? 'cloud' : 'device';
  return {
    kind: 'applied',
    ms: res.latencyMs,
    ranOn,
    message: result.message,
    pictures: wanted.length,
  };
}

/** Fetches the fix's new pictures and sets them on the scene, if the scene is still as fixed. */
async function fetchPictures(
  deps: ReelNoteFixDeps,
  sceneId: string,
  fixed: ReelScene,
): Promise<number> {
  const reel = deps.store.getState().project?.reel;
  if (!reel || !deps.fetchMedia) return 0;
  try {
    const mini: ReelPlan = { ...reel, scenes: [fixed] };
    const got = await deps.fetchMedia(mini, reel.look);
    const nowReel = deps.store.getState().project?.reel;
    const nowScene = nowReel?.scenes.find((s) => s.id === sceneId);
    // Only onto the scene as the fix left it (the user may have undone or edited it since).
    if (!nowReel || !nowScene || sceneJson(nowScene) !== sceneJson(fixed)) return 0;
    const withPics = got.plan.scenes[0];
    if (!withPics || got.assets.length === 0) return 0;
    const next: ReelPlan = {
      ...nowReel,
      scenes: nowReel.scenes.map((s) =>
        s.id === sceneId ? { ...withPics, ...(s.notes ? { notes: s.notes } : {}) } : s,
      ),
    };
    const landed = reelMediaOf({ scenes: [withPics] }).filter((m) => m.asset).length;
    deps.store.getState().exec(setReel(next, 'Add the picture', got.assets));
    return landed;
  } catch {
    return 0;
  }
}
