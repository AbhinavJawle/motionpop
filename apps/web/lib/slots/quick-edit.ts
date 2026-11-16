import {
  editContext,
  editPatchTask,
  splitEditDoc,
  applyParamsPatch,
  timingDefaultsFor,
  type Router,
} from '@motionpop/ai';
import type { AppConfig, EditorProject, Slot } from '@motionpop/schemas';
import { APP_CONFIG_DEFAULTS } from '@motionpop/schemas';
import type { Route } from '@/lib/ai/route';
import { applyVersion } from '@/lib/commands';
import { sameSlot } from '@/lib/commands/auto-fill';
import { styleFor } from '@/lib/composition/project-to-compile';
import { newSpendKey, type CreditsClient } from '@/lib/credits/client';
import { spendWithUi } from '@/lib/credits/spend-with-ui';
import { sceneFor, schemaFor } from '@/lib/motion/registry';
import type { EditorStore } from '@/lib/stores/editor';
import { newVersion } from './new-version';
import { sceneGate } from './scene-fill';

/**
 * The quick edit flow (spec 09 R7, design "Flows → Quick edit"). One instruction, one slot, one
 * route chosen by `chooseRoute` before the click:
 * - device: free, never reaches the cloud (the router gets `allowCloud: false`);
 * - cloud (a click on "Try in the cloud", or the user's preference): 1 credit, spent first with
 *   a new key, refunded when nothing was applied.
 * A model answer that is invalid after the router's repair is NOT escalated silently: the caller
 * shows "Couldn't do that on your device." and offers the cloud as a new click (D-035).
 */
export type QuickEditOutcome =
  | { kind: 'applied'; ms: number; ranOn: 'device' | 'cloud'; versionId: string }
  /** The model said it needs a new graphic; nothing was applied. */
  | { kind: 'escalate'; message: string }
  | { kind: 'device-failed' }
  | { kind: 'cloud-failed' }
  /** The slot was deleted or edited while the call ran; nothing applied, credits returned. */
  | { kind: 'changed' }
  | { kind: 'blocked'; reason: string }
  /** Not enough credits: the out-of-credits modal is open. */
  | { kind: 'no-credits' };

export interface QuickEditDeps {
  store: EditorStore;
  credits: CreditsClient | null;
  getRouter: () => Promise<Router | null>;
  config?: Pick<AppConfig, 'creditCosts' | 'imageCredits' | 'exportCredits'>;
  /** Where scene gates build slots off-screen. */
  doc?: Document;
  now?: () => number;
  newKey?: () => string;
}

const sameTiming = (a: Slot['timing'], b: Slot['timing']) =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export async function runQuickEdit(
  deps: QuickEditDeps,
  slotId: string,
  instruction: string,
  route: Route,
): Promise<QuickEditOutcome> {
  if (route.kind === 'disabled') return { kind: 'blocked', reason: route.reason };
  if (route.kind === 'local') return { kind: 'blocked', reason: 'Needs on-device AI' };
  const text = instruction.trim();
  const project: EditorProject | null = deps.store.getState().project;
  const slot = project?.slots.find((s) => s.id === slotId);
  if (!project || !slot) return { kind: 'changed' };
  const schema = schemaFor(slot.componentId);
  if (!schema) return { kind: 'blocked', reason: 'Coming soon' };
  if (text === '') return { kind: 'blocked', reason: 'Type what to change' };

  const defaults = timingDefaultsFor(styleFor(project).motion);
  const ctx = editContext(schema, slot.componentId, slot.params, slot.timing, defaults);
  const scene = sceneFor(slot.componentId);
  const gateFor = scene ? sceneGate(scene, project, slot, deps.doc) : null;

  // Cloud: reserve the credit first, with a key of its own for this attempt (D-047).
  let txId: string | null = null;
  if (route.kind === 'cloud') {
    if (!deps.credits) return { kind: 'blocked', reason: 'Sign in to use cloud AI' };
    const spent = await spendWithUi(
      deps.credits,
      { action: 'edit', key: (deps.newKey ?? newSpendKey)(), refId: slot.id },
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
    if (txId && deps.credits) await deps.credits.refund(txId);
  };

  const router = await deps.getRouter().catch(() => null);
  if (!router) {
    await refund();
    return route.kind === 'cloud' ? { kind: 'cloud-failed' } : { kind: 'device-failed' };
  }

  const task = editPatchTask(schemaFor, {
    timingDefaults: defaults,
    ...(gateFor ? { gate: (_id: string, params: unknown) => gateFor.check(params) } : {}),
  });
  let res;
  try {
    res = await router.run(
      task,
      { ...ctx, instruction: text },
      { mode: route.mode, allowCloud: false },
    );
  } catch {
    await refund();
    return route.kind === 'cloud' ? { kind: 'cloud-failed' } : { kind: 'device-failed' };
  }

  // The slot moved on while the model worked: never overwrite what the user did meanwhile.
  const current = deps.store.getState().project?.slots.find((s) => s.id === slotId);
  if (!current || !sameSlot(current, slot) || !sameTiming(current.timing, slot.timing)) {
    await refund();
    return { kind: 'changed' };
  }

  if (res.output.escalate) {
    await refund();
    return {
      kind: 'escalate',
      message: res.output.message?.trim() || 'That needs a new graphic. Try Generate.',
    };
  }

  const applied = applyParamsPatch(ctx.current, res.output.patch);
  if (!applied.ok) {
    await refund();
    return route.kind === 'cloud' ? { kind: 'cloud-failed' } : { kind: 'device-failed' };
  }
  const { params, timing } = splitEditDoc(applied.params, defaults);
  const ranOn = res.ranOn === 'cloud' ? 'cloud' : 'device';
  const version = newVersion({
    slotId,
    componentId: slot.componentId,
    params,
    timing,
    source: ranOn === 'cloud' ? 'ai-cloud' : 'ai-device',
    model: res.model,
    costCredits: ranOn === 'cloud' ? res.costCredits : 0,
    label: text,
    now: (deps.now ?? Date.now)(),
  });
  const ok = deps.store.getState().exec(applyVersion(slotId, { params, timing, version }));
  if (!ok) {
    await refund();
    return { kind: 'changed' };
  }
  return { kind: 'applied', ms: res.latencyMs, ranOn, versionId: version.id };
}
