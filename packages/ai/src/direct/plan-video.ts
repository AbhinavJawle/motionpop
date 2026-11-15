import type { RanOn } from '@motionpop/schemas';
import type { Router } from '../router';
import { directPlan, planContextOf, type DirectPlanInput } from '../tasks/direct-plan';
import { enforcePlan, type EnforcedPlan } from './enforce';
import { fallbackPlan } from './fallback';

export interface PlanVideoDeps {
  /**
   * Asked before a cloud plan: the server counts the day's free cloud plans per user
   * (`POST /api/ai/plan-allowance`). `limit` when the day's are used up.
   */
  cloudAllowed: () => Promise<
    { allowed: true } | { allowed: false; reason: 'limit' | 'unavailable' }
  >;
  /** Stable per project, for the enforcer's variant rotation. */
  seed: number;
}

export interface PlannedVideo {
  plan: EnforcedPlan;
  /** Where the plan came from: the model on the device or in the cloud, or the built-in rules. */
  source: RanOn | 'rules';
  /** Why the built-in rules planned it, when they did. */
  why?: 'no-model' | 'failed' | 'limit';
  model?: string;
  latencyMs?: number;
}

/**
 * The director (spec 07 R6.1): `direct.plan` on the device first; if that can't run, one of the
 * day's free cloud plans when the server allows it; otherwise the code-only plan. Whatever
 * plans it, `enforcePlan` applies the hard rules. Never throws and never spends credits.
 */
export async function planVideo(
  router: Router | null,
  input: Omit<DirectPlanInput, 'route'>,
  deps: PlanVideoDeps,
): Promise<PlannedVideo> {
  const ctx = planContextOf(input, deps.seed);
  const rules = (why: PlannedVideo['why']): PlannedVideo => ({
    plan: enforcePlan(fallbackPlan(ctx), ctx),
    source: 'rules',
    ...(why ? { why } : {}),
  });
  if (!router) return rules('no-model');
  const attempt = async (route: DirectPlanInput['route']): Promise<PlannedVideo | null> => {
    try {
      const res = await router.run(directPlan, { ...input, route });
      return {
        plan: enforcePlan(res.output, ctx),
        source: res.ranOn,
        model: res.model,
        latencyMs: res.latencyMs,
      };
    } catch {
      return null;
    }
  };
  const onDevice = await attempt('device');
  if (onDevice) return onDevice;
  const allowance = await deps
    .cloudAllowed()
    .catch(() => ({ allowed: false as const, reason: 'unavailable' as const }));
  if (!allowance.allowed) return rules(allowance.reason === 'limit' ? 'limit' : 'failed');
  return (await attempt('cloud')) ?? rules('failed');
}
