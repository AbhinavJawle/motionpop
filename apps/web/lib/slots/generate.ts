import { componentFillTask, type Router } from '@motionpop/ai';
import { APP_CONFIG_DEFAULTS, costOf, type AppConfig } from '@motionpop/schemas';
import type { Route } from '@/lib/ai/route';
import { applyVersion, markFailed } from '@/lib/commands';
import { newSpendKey, type CreditsClient, type SpendResult } from '@/lib/credits/client';
import { spendWithUi } from '@/lib/credits/spend-with-ui';
import { sceneFor, schemaFor } from '@/lib/motion/registry';
import type { EditorStore } from '@/lib/stores/editor';
import { componentFillInput } from './component-fill-input';
import { newVersion } from './new-version';
import { sceneFillInput, sceneGate } from './scene-fill';
import { askedGraphicType } from './graphic-types';
import { switchGraphic } from './switch-graphic';
import { validateParams } from './validate-params';

/**
 * Generate (spec 09 R6, design "Flows → Generate"): one slot, the cloud, 3 credits.
 *
 * Order: route check → one Generate per project → reserve the credits with a NEW key for this
 * attempt (D-047) → `component.fill` with purpose `generate` (ONLY_IN_CLOUD, 2 repairs inside the
 * price) → check the slot is still the one we asked about → apply as one version. Every path that
 * applies nothing gives the credits back, once.
 */
export type GenerateOutcome =
  /** A new version was applied. */
  | 'ready'
  /** The call failed and the slot was not ready: it is now `failed`. */
  | 'failed'
  /** The call failed and the slot was ready: it keeps its graphic. */
  | 'kept'
  /** The slot was deleted or its component or words changed meanwhile; credits returned. */
  | 'discarded'
  /** Not enough credits: the out-of-credits modal is open. */
  | 'no-credits'
  /** Nothing ran (route, another Generate, nothing to generate); `reason` says why. */
  | 'blocked';

export interface GenerateResult {
  outcome: GenerateOutcome;
  /** Measured latency of the model call, set when `outcome` is `ready`. */
  ms?: number;
  versionId?: string;
  reason?: string;
}

export interface GenerateDeps {
  store: EditorStore;
  credits: CreditsClient | null;
  getRouter: () => Promise<Router | null>;
  config?: Pick<AppConfig, 'creditCosts' | 'imageCredits' | 'exportCredits'>;
  /** Where scene gates build slots off-screen. */
  doc?: Document;
  now?: () => number;
  newKey?: () => string;
}

export const PIP_IS_ON_IT = 'Pip is on it';
export const COULDNT_GENERATE = 'Couldn’t generate';

/** A spend refused for a key that was used before takes one fresh key, once. */
async function reserve(
  deps: GenerateDeps,
  credits: CreditsClient,
  slotId: string,
  cfg: NonNullable<GenerateDeps['config']>,
): Promise<SpendResult | null> {
  const key = deps.newKey ?? newSpendKey;
  let spent = await spendWithUi(credits, { action: 'generate', key: key(), refId: slotId }, cfg);
  if (spent && !spent.ok && spent.reason === 'key-used') {
    spent = await spendWithUi(credits, { action: 'generate', key: key(), refId: slotId }, cfg);
  }
  return spent;
}

export async function generateSlot(
  deps: GenerateDeps,
  slotId: string,
  route: Route,
): Promise<GenerateResult> {
  const { store } = deps;
  const now = deps.now ?? Date.now;
  if (route.kind === 'disabled') return { outcome: 'blocked', reason: route.reason };
  if (route.kind !== 'cloud') return { outcome: 'blocked', reason: 'Needs cloud AI' };
  if (store.getState().generating) return { outcome: 'blocked', reason: PIP_IS_ON_IT };

  // A prompt that names another graphic type ("a map of…", "as a chart") switches the slot to
  // it first (free, one undo step), so Generate makes what the creator asked for.
  const asking = store.getState().project?.slots.find((s) => s.id === slotId);
  const asked = asking ? askedGraphicType(asking.prompt, asking.componentId) : null;
  // Drafting the new type measures text, so it needs a document (always there in the app).
  const doc = deps.doc ?? (typeof document === 'undefined' ? undefined : document);
  if (asked && sceneFor(asked) && doc) switchGraphic(store, slotId, asked, doc);

  const project = store.getState().project;
  const slot = project?.slots.find((s) => s.id === slotId);
  if (!project || !slot) return { outcome: 'discarded' };
  if (!schemaFor(slot.componentId)) return { outcome: 'blocked', reason: 'Coming soon' };
  if (!deps.credits) return { outcome: 'blocked', reason: 'Sign in to use cloud AI' };
  const wasReady = slot.status === 'ready';

  // Taken before the first await, so two quick clicks can never both pass the check above.
  store.getState().setGenerating({ slotId, phase: 'preparing', startedAt: now() });
  let txId: string | null = null;
  const refund = async () => {
    const id = txId;
    txId = null;
    if (id && deps.credits) await deps.credits.refund(id);
  };
  const fail = async (): Promise<GenerateResult> => {
    await refund();
    const current = store.getState().project?.slots.find((s) => s.id === slotId);
    if (!current) return { outcome: 'discarded' };
    if (!wasReady && current.status !== 'ready') {
      store.getState().exec(markFailed(slotId, COULDNT_GENERATE));
      return { outcome: 'failed' };
    }
    return { outcome: 'kept' };
  };

  try {
    const cfg = deps.config ?? APP_CONFIG_DEFAULTS;
    const spent = await reserve(deps, deps.credits, slotId, cfg);
    if (spent === null) return { outcome: 'no-credits' };
    if (!spent.ok) {
      return spent.reason === 'insufficient'
        ? { outcome: 'no-credits' }
        : { outcome: 'blocked', reason: 'Couldn’t reserve the credits' };
    }
    txId = spent.txId;

    const router = await deps.getRouter().catch(() => null);
    if (!router) return await fail();

    // The input is built from what the slot is now, not from before the credits were reserved.
    const live = store.getState().project?.slots.find((s) => s.id === slotId);
    if (!live) return await fail();
    const scene = sceneFor(live.componentId);
    const gate = scene ? sceneGate(scene, project, live, deps.doc) : null;
    const task = componentFillTask(schemaFor, {
      ...(gate ? { gate: (_id: string, params: unknown) => gate.check(params) } : {}),
    });
    const input = scene
      ? sceneFillInput(scene, project, live, 'generate')
      : componentFillInput(project, live, 'generate');
    store.getState().setGenerating({ slotId, phase: 'animating', startedAt: now() });

    let res;
    try {
      res = await router.run(task, input, { mode: route.mode });
    } catch {
      return await fail();
    }
    // A model that says it lacks a value has not made the graphic the user paid for.
    if (res.output.needsInput?.length) return await fail();

    // Component or words changed while the model worked: the result is for a different slot.
    const current = store.getState().project?.slots.find((s) => s.id === slotId);
    if (
      !current ||
      current.componentId !== live.componentId ||
      current.wordStart !== live.wordStart ||
      current.wordEnd !== live.wordEnd
    ) {
      await refund();
      return { outcome: 'discarded' };
    }

    const v = validateParams(current.componentId, res.output.params);
    const version = newVersion({
      slotId,
      componentId: current.componentId,
      params: v.params,
      timing: current.timing,
      source: 'ai-cloud',
      model: res.model,
      costCredits: costOf('generate', 1, cfg),
      label: 'Generated',
      now: now(),
    });
    const ok = store
      .getState()
      .exec(applyVersion(slotId, { params: v.params, timing: current.timing, version }));
    if (!ok) {
      await refund();
      return { outcome: 'discarded' };
    }
    return { outcome: 'ready', ms: res.latencyMs, versionId: version.id };
  } catch {
    // Anything unexpected still gives the credits back (a no-op when nothing was reserved).
    return await fail();
  } finally {
    store.getState().setGenerating(null);
  }
}
