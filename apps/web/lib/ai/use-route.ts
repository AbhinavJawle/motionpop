'use client';

import type { AppConfig } from '@motionpop/schemas';
import { useCreditsBalance, useCreditsClient } from '../credits/use-credits-client';
import { useAppConfig } from '../renders/hooks';
import { usePreferOnDevice } from '../settings/use-prefer-on-device';
import { useAIStatus } from './ai-status';
import { chooseRoute, cloudCostFor, type Route, type RouteInput, type RoutedTask } from './route';

/** Pure assembly of `RouteInput` from the app's live state (so it can be tested without React). */
export function routeInputFrom(s: {
  task: RoutedTask;
  availability: RouteInput['availability'];
  online: boolean;
  preferOnDevice: boolean;
  config: Pick<
    AppConfig,
    'killSwitch' | 'creditCosts' | 'imageCredits' | 'exportCredits' | 'routingOverrides'
  >;
  cloudAvailable: boolean;
  cloudBlockedReason: string | null;
  balance: number | null;
  forceCloud?: boolean;
  preferProvider?: 'nano' | 'local-llm';
  byok?: boolean;
  localLlm?: boolean;
}): RouteInput {
  const reason =
    s.cloudBlockedReason === 'Cloud AI is coming soon' ||
    s.cloudBlockedReason === 'Sign in to use cloud AI'
      ? s.cloudBlockedReason
      : undefined;
  const override = s.config.routingOverrides[s.task];
  return {
    task: s.task,
    availability: s.availability,
    online: s.online,
    preferOnDevice: s.preferOnDevice,
    killSwitch: s.config.killSwitch,
    cloudAvailable: s.cloudAvailable,
    ...(reason ? { cloudBlockedReason: reason } : {}),
    ...(override ? { override } : {}),
    balance: s.balance,
    cloudCost: cloudCostFor(s.task, s.config),
    ...(s.forceCloud ? { forceCloud: true } : {}),
    ...(s.preferProvider ? { preferProvider: s.preferProvider } : {}),
    ...(s.byok ? { byok: true } : {}),
    ...(s.localLlm ? { localLlm: true } : {}),
  };
}

/**
 * The route of a task from live state, including the Settings toggle: turning "Prefer on-device
 * AI" off moves quick edits to `☁ 1` at once and leaves auto-fill on the device (spec 13 R6.5).
 */
export function useRoute(
  task: RoutedTask,
  opts: { forceCloud?: boolean; preferProvider?: 'nano' | 'local-llm' } = {},
): Route {
  const { availability, online } = useAIStatus();
  const { preferOnDevice } = usePreferOnDevice();
  const {
    cloudAvailable,
    realCloudAvailable,
    cloudBlockedReason,
    realCloudBlockedReason,
    byok,
    localLlm,
  } = useCreditsClient();
  const balance = useCreditsBalance();
  const config = useAppConfig();
  const effectiveCloudAvailable = opts.forceCloud
    ? (realCloudAvailable ?? cloudAvailable)
    : cloudAvailable;
  const effectiveBlockedReason = opts.forceCloud
    ? (realCloudBlockedReason ?? cloudBlockedReason)
    : cloudBlockedReason;
  return chooseRoute(
    routeInputFrom({
      task,
      availability,
      online,
      preferOnDevice,
      config,
      cloudAvailable: effectiveCloudAvailable,
      cloudBlockedReason: effectiveBlockedReason,
      balance,
      ...(opts.forceCloud ? { forceCloud: true } : {}),
      ...(opts.preferProvider ? { preferProvider: opts.preferProvider } : {}),
      ...(byok ? { byok: true } : {}),
      ...(localLlm ? { localLlm: true } : {}),
    }),
  );
}
