import { customComposeTask } from '@motionpop/ai';
import { customExample, customParams, lintCustom } from '@motionpop/motion';
import { lookFor } from '@/lib/motion/registry';
import { APP_CONFIG_DEFAULTS, costOf } from '@motionpop/schemas';
import type { Route } from '@/lib/ai/route';
import { applyVersion } from '@/lib/commands';
import { newSpendKey } from '@/lib/credits/client';
import { spendWithUi } from '@/lib/credits/spend-with-ui';
import type { GenerateDeps, GenerateResult } from './generate';
import { PIP_IS_ON_IT } from './generate';
import { newVersion } from './new-version';

/** Shown when no valid graphic came back (spec 15 R2.3). */
export const COULDNT_CUSTOM = 'Couldn’t make that one. Try the library.';

const EXAMPLE = customExample();

/**
 * Tier 2 (spec 15 R1.2, R3.3): the slot's prompt becomes a brief, the cloud writes a custom
 * graphic, it is linted again here and applied as a new version with the component switched to
 * `custom` (one undo). 3 credits, refunded on any failure; a ready slot keeps its graphic.
 */
export async function generateCustom(
  deps: GenerateDeps,
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
  if (!project || !slot) return { outcome: 'discarded' };
  const brief = slot.prompt.trim();
  if (brief.length < 3) return { outcome: 'blocked', reason: 'Describe the graphic first' };
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
    if (!spent.ok) {
      return spent.reason === 'insufficient'
        ? { outcome: 'no-credits' }
        : { outcome: 'blocked', reason: 'Couldn’t reserve the credits' };
    }
    txId = spent.txId;
    const router = await deps.getRouter().catch(() => null);
    if (!router) {
      await refund();
      return { outcome: 'kept', reason: COULDNT_CUSTOM };
    }
    const words = project.transcript.words
      .slice(slot.wordStart, slot.wordEnd + 1)
      .map((w) => w.text)
      .join(' ');
    store.getState().setGenerating({ slotId, phase: 'animating', startedAt: now() });
    let res;
    try {
      res = await router.run(
        customComposeTask(lintCustom),
        {
          brief,
          words: words.slice(0, 2000),
          durationMs: Math.min(12_000, Math.max(1500, slot.endMs - slot.startMs)),
          format: project.format,
          look: { name: lookFor(project.styleId).name },
          example: { html: EXAMPLE.html, css: EXAMPLE.css, script: EXAMPLE.script },
        },
        { mode: route.mode },
      );
    } catch {
      await refund();
      return { outcome: 'kept', reason: COULDNT_CUSTOM };
    }
    // Checked again here: the stored params are what the composition will run.
    const parsed = customParams.safeParse({ ...res.output, brief });
    if (!parsed.success || lintCustom(parsed.data).length > 0) {
      await refund();
      return { outcome: 'kept', reason: COULDNT_CUSTOM };
    }
    const current = store.getState().project?.slots.find((s) => s.id === slotId);
    if (!current || current.wordStart !== slot.wordStart || current.wordEnd !== slot.wordEnd) {
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
      model: res.model,
      costCredits: costOf('custom', 1, cfg),
      label: 'Custom',
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
    return { outcome: 'ready', ms: res.latencyMs, versionId: version.id };
  } catch {
    await refund();
    return { outcome: 'kept', reason: COULDNT_CUSTOM };
  } finally {
    store.getState().setGenerating(null);
  }
}
