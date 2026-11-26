import {
  chromeOnDeviceProvider,
  createRouter,
  geminiByokProvider,
  localLlmProvider,
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
import { getLocalLlmConfig, subscribeLocalLlm } from './local-llm';

/**
 * The browser's AI router (hybrid-ai.md, Spec 42 BYOK, Local LLM):
 * - With Local LLM enabled (Ollama / LM Studio / custom OpenAI-compatible): full local provider
 *   running all routed tasks directly against the user's local server at 0 Motionpop credits.
 * - With BYOK key saved in browser: `geminiByokProvider` sending cloud requests directly to
 *   Google AI Studio (`x-goog-api-key` header) while STILL trying on-device Gemini Nano first.
 * - Default: Firebase AI Logic provider (on-device Gemini Nano + cloud Gemini) + Remote Config.
 * - `null` when none of the above is configured (local mode); callers use deterministic fallbacks.
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

/** Drops the cached router so the next call rebuilds with the latest provider state. */
export function resetRouter(): void {
  routerPromise = null;
}

// Automatically swap the router when the user updates Local LLM or BYOK settings.
subscribeByok(resetRouter);
subscribeLocalLlm(resetRouter);

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

    const localCfg = getLocalLlmConfig();
    if (localCfg) {
      return createRouter({
        provider: localLlmProvider({
          baseUrl: localCfg.baseUrl,
          model: localCfg.model,
          apiKey: localCfg.apiKey,
        }),
        config: () => ({
          ...APP_CONFIG_DEFAULTS,
          killSwitch: false,
          modelFast: localCfg.model,
          modelStrong: localCfg.model,
          modelFilmBuild: localCfg.model,
        }),
        onUsage: (e) => emitAIUsage({ ...e, credits: 0, ranOn: 'device' }),
        cache: idbRouterCache(),
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
