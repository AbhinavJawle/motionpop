import { APP_CONFIG_DEFAULTS, costOf, type CostConfig } from '@motionpop/schemas';
import type { Availability } from './ai-status';

/**
 * Where an AI action runs (spec 09 design, "Route decision"; spec 13 task 15 wires
 * `preferOnDevice` into it). One pure function: the chip on screen and the router call both read
 * its answer, which is how "a mint chip never costs credits" is enforced. Spec 13 wrote it
 * because its Settings toggle has to change it; spec 09 task 3 adds its table and property P4.
 *
 * `autofill` is spec 13's addition to the routed tasks: the background fill after processing is
 * on the device or deterministic defaults, **never the cloud, whatever the preference** (R6.5).
 */
export type { Availability } from './ai-status';
export type RoutedTask =
  | 'edit.patch'
  | 'note.fix'
  | 'generate'
  | 'prompt.prefill'
  | 'autofill'
  | 'pip.plan'
  | 'custom.compose';
export type InferenceModeName =
  'ONLY_ON_DEVICE' | 'PREFER_ON_DEVICE' | 'PREFER_IN_CLOUD' | 'ONLY_IN_CLOUD';

export type BlockedReason =
  | 'Needs connection'
  | 'Cloud AI is paused'
  | 'Sign in to use cloud AI'
  | 'Cloud AI is coming soon'
  | 'Needs on-device AI';

export interface RouteInput {
  task: RoutedTask;
  availability: Availability;
  online: boolean;
  /** `users/{uid}.settings.preferOnDevice` (spec 13); true in local mode. */
  preferOnDevice: boolean;
  /** Remote Config kill switch. */
  killSwitch: boolean;
  /** False in local mode, signed out, or while `ServerCredits` does not exist. */
  cloudAvailable: boolean;
  cloudBlockedReason?: 'Sign in to use cloud AI' | 'Cloud AI is coming soon';
  /** Remote Config `routingOverrides[task]`, if any. */
  override?: InferenceModeName;
  /** Null while loading. */
  balance: number | null;
  /** `costOf('edit' | 'generate')`. */
  cloudCost: number;
  /** The user clicked "Try in the cloud". */
  forceCloud?: boolean;
}

export type Route =
  | { kind: 'device'; mode: 'ONLY_ON_DEVICE'; allowCloud: false }
  | {
      kind: 'cloud';
      mode: 'ONLY_IN_CLOUD';
      allowCloud: false;
      credits: number;
      insufficient: boolean;
    }
  /** Deterministic code (the prefill template, the scene's safe defaults). */
  | { kind: 'local' }
  | { kind: 'disabled'; reason: BlockedReason };

const DEVICE: Route = { kind: 'device', mode: 'ONLY_ON_DEVICE', allowCloud: false };
const disabled = (reason: BlockedReason): Route => ({ kind: 'disabled', reason });

function cloudRoute(i: RouteInput): Route {
  if (!i.online) return disabled('Needs connection');
  if (!i.cloudAvailable) return disabled(i.cloudBlockedReason ?? 'Sign in to use cloud AI');
  if (i.killSwitch) return disabled('Cloud AI is paused');
  return {
    kind: 'cloud',
    mode: 'ONLY_IN_CLOUD',
    allowCloud: false,
    credits: i.cloudCost,
    insufficient: i.balance !== null && i.balance < i.cloudCost,
  };
}

/**
 * Rules, in order (`checking` counts as not available, so the first second after load shows
 * ☁ 1 rather than a mint chip that could turn into a charge):
 * 1. `prompt.prefill` and `autofill`: the device when available, else deterministic code. Never cloud.
 * 2. `generate`: always the cloud route (offline, no cloud, paused, else cloud).
 * 3. `edit.patch` and `note.fix`: the device when it is available and (the user prefers it, or
 *    the cloud can't be used) and the user did not ask for the cloud; otherwise the cloud route.
 * 4. Remote Config overrides: a cloud mode acts like `preferOnDevice: false`; `ONLY_ON_DEVICE`
 *    forbids the cloud for that task. They never make prefill or autofill cloud, or generate device.
 */
export function chooseRoute(i: RouteInput): Route {
  const deviceReady = i.availability === 'available';
  if (i.task === 'prompt.prefill' || i.task === 'autofill') {
    return deviceReady ? DEVICE : { kind: 'local' };
  }
  // Pip plans reason over the whole timeline: the cloud (hybrid-ai.md, PREFER_IN_CLOUD).
  if (i.task === 'generate' || i.task === 'pip.plan' || i.task === 'custom.compose') {
    return cloudRoute(i);
  }

  // edit.patch / note.fix
  if (i.override === 'ONLY_ON_DEVICE') return deviceReady ? DEVICE : disabled('Needs on-device AI');
  const cloudOverride = i.override === 'PREFER_IN_CLOUD' || i.override === 'ONLY_IN_CLOUD';
  const prefersDevice = i.preferOnDevice && !cloudOverride;
  const cloudUsable = i.online && i.cloudAvailable;
  if (deviceReady && !i.forceCloud && (prefersDevice || !i.online || !cloudUsable)) return DEVICE;
  return cloudRoute(i);
}

/** The chip shown before the action: mint `⚡ free · on-device`, violet `☁ N`, or none. */
export function chipFor(
  r: Route,
): { route: 'device' } | { route: 'cloud'; credits: number } | null {
  if (r.kind === 'device') return { route: 'device' };
  if (r.kind === 'cloud') return { route: 'cloud', credits: r.credits };
  return null;
}

/** The price of a routed task's cloud route, from the one cost table. */
export function cloudCostFor(task: RoutedTask, cfg: CostConfig = APP_CONFIG_DEFAULTS): number {
  if (task === 'pip.plan') return costOf('pip-plan', 1, cfg);
  if (task === 'custom.compose') return costOf('custom', 1, cfg);
  return costOf(task === 'generate' ? 'generate' : 'edit', 1, cfg);
}
