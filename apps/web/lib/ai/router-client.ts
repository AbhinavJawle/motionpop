import {
  chromeOnDeviceProvider,
  createRouter,
  geminiByokProvider,
  type AIProvider,
  type Router,
  type UsageEvent,
} from '@motionpop/ai';
import { APP_CONFIG_DEFAULTS } from '@motionpop/schemas';
import { firebaseEnabled, getAILogic } from '@/lib/firebase/client';
import { loadAppConfig } from '@/lib/firebase/remote-config';
import { getByokKey, getByokModel, getByokModelMode, subscribeByok } from './byok';
import { createFakeRouter, routerKind } from './fake-router';
import { idbRouterCache } from './idb-cache';

/**
 * The browser's AI router (hybrid-ai.md, Spec 42 BYOK):
 * - Default: Firebase AI Logic provider (on-device Gemini Nano + cloud Gemini) + Remote Config.
 * - With BYOK key saved in browser: `geminiByokProvider` sending cloud requests directly to
 *   Google AI Studio (`x-goog-api-key` header) while STILL trying on-device Gemini Nano first!
 * - `null` when neither Firebase nor BYOK is configured (local mode); callers use deterministic fallbacks.
 */
let routerPromise: Promise<Router | null> | null = null;
const listeners = new Set<(e: UsageEvent) => void>();

export function onAIUsage(fn: (e: UsageEvent) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Tells every listener about a usage event (the router calls it; dev and test builds can too). */
export function emitAIUsage(e: UsageEvent): void {
  listeners.forEach((l) => l(e));
}

/** Drops the cached router so the next call rebuilds with the latest BYOK / provider state. */
export function resetRouter(): void {
  routerPromise = null;
}

// Automatically swap the router when the user saves, switches mode, or clears their BYOK key.
subscribeByok(resetRouter);

export function getRouter(): Promise<Router | null> {
  routerPromise ??= (async () => {
    // The fake router (spec 09): only with NEXT_PUBLIC_FAKE_AI=1 and never in a production build.
    const kind = routerKind(
      {
        NODE_ENV: process.env.NODE_ENV,
        NEXT_PUBLIC_FAKE_AI: process.env.NEXT_PUBLIC_FAKE_AI,
      },
      firebaseEnabled(),
    );
    if (kind === 'fake') {
      return createFakeRouter({
        search: typeof window === 'undefined' ? '' : window.location.search,
        onUsage: emitAIUsage,
      });
    }

    const byokKey = getByokKey();
    if (byokKey) {
      let onDevice: AIProvider = chromeOnDeviceProvider();
      let config = APP_CONFIG_DEFAULTS;
      if (firebaseEnabled()) {
        const [loaded, { firebaseProvider }] = await Promise.all([
          loadAppConfig().catch(() => ({ config: APP_CONFIG_DEFAULTS })),
          import('@motionpop/ai/firebase'),
        ]);
        config = loaded.config;
        onDevice = firebaseProvider(getAILogic);
      }
      return createRouter({
        provider: geminiByokProvider({
          apiKey: byokKey,
          onDevice,
          modelMode: getByokModelMode(),
          customModel: getByokModel(),
        }),
        config: () => config,
        onUsage: (e) => emitAIUsage({ ...e, credits: 0 }),
        cache: idbRouterCache(),
      });
    }

    if (kind === 'none') return null;
    const [{ config }, { firebaseProvider }] = await Promise.all([
      loadAppConfig(),
      import('@motionpop/ai/firebase'),
    ]);
    return createRouter({
      provider: firebaseProvider(getAILogic),
      config: () => config,
      onUsage: emitAIUsage,
      cache: idbRouterCache(),
    });
  })().catch((err: unknown) => {
    routerPromise = null; // let the next call retry
    throw err;
  });
  return routerPromise;
}
