import { beatWords, rebuildBeat } from '@motionpop/ai';
import {
  KIT_DOC,
  archetypeExample,
  customParams,
  kitExample,
  lintCustom,
  lintProp,
  reelExampleFor,
  videoStageZoneGuide,
} from '@motionpop/motion';
import {
  APP_CONFIG_DEFAULTS,
  costOf,
  spokenNumbers,
  timeBeats,
  type EditorProject,
  type Slot,
} from '@motionpop/schemas';
import type { Route } from '@/lib/ai/route';
import { applyVersion } from '@/lib/commands';
import { loadCompositionAssets } from '@/lib/composition/assets';
import { styleFor } from '@/lib/composition/project-to-compile';
import { newSpendKey } from '@/lib/credits/client';
import { spendWithUi } from '@/lib/credits/spend-with-ui';
import { COULDNT_CUSTOM } from '@/lib/slots/custom';
import { PIP_IS_ON_IT, type GenerateDeps, type GenerateResult } from '@/lib/slots/generate';
import { newVersion } from '@/lib/slots/new-version';
import type { FilmDeps } from './film';
import { inspectInSandbox } from './sandbox-critic';

export const BEAT_RETIMED = 'This beat was retimed. Remake the film to rebuild it.';

/** A slot that is a beat of the project's film. */
export function isFilmBeat(project: EditorProject | null, slot: Slot | null): boolean {
  return Boolean(project?.film && slot && slot.componentId === 'custom' && slot.skillId === 'film');
}

/** The storyboard beat a slot plays (same words), or -1 when it was retimed since. */
export function beatIndexOf(project: EditorProject, slot: Slot): number {
  return (
    project.film?.storyboard.beats.findIndex(
      (b) => b.wordStart === slot.wordStart && b.wordEnd === slot.wordEnd,
    ) ?? -1
  );
}

/**
 * "Rebuild this beat" (spec 07b R5.3): one beat of the film written again from the saved
 * storyboard, with the slot's prompt as its picture when the creator rewrote it. The price of a
 * custom graphic, refunded when no usable beat comes back; one undo step; the other beats and the
 * seams on both sides are untouched.
 */
export async function rebuildFilmBeat(
  deps: GenerateDeps & { inspect?: FilmDeps['inspect'] },
  slotId: string,
  route: Route,
): Promise<GenerateResult> {
  const { store } = deps;
  const now = deps.now ?? Date.now;
  if (route.kind === 'disabled') return { outcome: 'blocked', reason: route.reason };
  if (route.kind !== 'cloud') return { outcome: 'blocked', reason: 'Needs cloud AI' };
  if (store.getState().generating) return { outcome: 'blocked', reason: PIP_IS_ON_IT };
  const project = store.getState().project;
  const slot = project?.slots.find((s) => s.id === slotId);
  if (!project || !slot || !project.film) return { outcome: 'discarded' };
  const index = beatIndexOf(project, slot);
  if (index < 0) return { outcome: 'blocked', reason: BEAT_RETIMED };
  if (!deps.credits) return { outcome: 'blocked', reason: 'Sign in to use cloud AI' };

  store.getState().setGenerating({ slotId, phase: 'preparing', startedAt: now() });
  let txId: string | null = null;
  const refund = async () => {
    const id = txId;
    txId = null;
    if (id && deps.credits) await deps.credits.refund(id);
  };
  try {
    const cfg = deps.config ?? APP_CONFIG_DEFAULTS;
    const spent = await spendWithUi(
      deps.credits,
      { action: 'custom', key: (deps.newKey ?? newSpendKey)(), refId: slotId },
      cfg,
    );
    if (spent === null) return { outcome: 'no-credits' };
    if (!spent.ok)
      return spent.reason === 'insufficient'
        ? { outcome: 'no-credits' }
        : { outcome: 'blocked', reason: 'Couldn’t reserve the credits' };
    txId = spent.txId;
    const [router, assets] = await Promise.all([
      deps.getRouter().catch(() => null),
      deps.inspect ? Promise.resolve(null) : loadCompositionAssets().catch(() => null),
    ]);
    if (!router) {
      await refund();
      return { outcome: 'kept', reason: COULDNT_CUSTOM };
    }
    const style = styleFor(project);
    const words = project.transcript.words.map((w) => ({
      text: w.text,
      startMs: w.startMs,
      endMs: w.endMs,
    }));
    const allowNumbers = [...spokenNumbers(words)];
    const hasVideo = Boolean(project.video);
    const inspect: FilmDeps['inspect'] =
      deps.inspect ??
      (assets
        ? (params, beat) =>
            inspectInSandbox({
              params,
              beat,
              words: beatWords(beat, words),
              format: project.format,
              style,
              assets,
              allowNumbers,
              ...(hasVideo ? { hasVideo: true } : {}),
              ...(hasVideo && (beat.videoStage ?? 'full') !== 'cutaway'
                ? { transparent: true }
                : {}),
              ...(deps.doc ? { doc: deps.doc } : {}),
            })
        : undefined);
    const board = project.film.storyboard;
    const idea = slot.prompt.trim();
    const rebuildModel = project.film.model;
    store.getState().setGenerating({ slotId, phase: 'animating', startedAt: now() });
    const started = now();
    let built;
    try {
      built = await rebuildBeat(
        {
          words,
          durationMs: project.durationMs,
          format: project.format,
          look: { name: style.name, description: style.description.slice(0, 300) },
          ...(hasVideo ? { hasVideo: true } : {}),
        },
        {
          router,
          lint: lintCustom,
          lintProp,
          kitDoc: KIT_DOC,
          example: kitExample(),
          exampleFor: (beat) =>
            hasVideo
              ? reelExampleFor(beat.videoStage, beat.archetype, beat.lead)
              : archetypeExample(beat.archetype, beat.lead),
          stageGuideFor: videoStageZoneGuide,
          ...(rebuildModel ? { model: rebuildModel, buildModel: rebuildModel } : {}),
          ...(inspect ? { inspect } : {}),
          storyboard: board,
          props: project.film.props,
        },
        index,
        // The prompt is the beat's picture: a rewritten prompt is a new picture.
        idea !== board.beats[index]?.idea ? idea : undefined,
      );
    } catch {
      await refund();
      return { outcome: 'kept', reason: COULDNT_CUSTOM };
    }
    const parsed = built.params ? customParams.safeParse(built.params) : null;
    if (!parsed?.success || lintCustom(parsed.data).length > 0) {
      await refund();
      return { outcome: 'kept', reason: COULDNT_CUSTOM };
    }
    // The beat must still be the one we rebuilt: same slot, same words, same times.
    const current = store.getState().project?.slots.find((s) => s.id === slotId);
    const timed = timeBeats(board, words, project.durationMs)[index];
    if (
      !current ||
      current.wordStart !== slot.wordStart ||
      current.wordEnd !== slot.wordEnd ||
      !timed ||
      current.startMs !== timed.startMs ||
      current.endMs !== timed.endMs
    ) {
      await refund();
      return { outcome: 'discarded' };
    }
    const params = parsed.data as unknown as Record<string, unknown>;
    const version = newVersion({
      slotId,
      componentId: 'custom',
      params,
      timing: current.timing,
      source: 'ai-cloud',
      costCredits: costOf('custom', 1, cfg),
      label: 'Rebuilt beat',
      now: now(),
    });
    const ok = store
      .getState()
      .exec(
        applyVersion(slotId, { params, timing: current.timing, version, componentId: 'custom' }),
      );
    if (!ok) {
      await refund();
      return { outcome: 'discarded' };
    }
    return { outcome: 'ready', ms: now() - started, versionId: version.id };
  } catch {
    await refund();
    return { outcome: 'kept', reason: COULDNT_CUSTOM };
  } finally {
    store.getState().setGenerating(null);
  }
}
