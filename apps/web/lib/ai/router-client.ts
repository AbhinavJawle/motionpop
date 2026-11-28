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
 * - With Local LLM enabled (Ollama / LM Studio / custom OpenAI-compatible): hybrid local provider
 *   running lightweight `*_ON_DEVICE` tasks on Chrome Gemini Nano first (when ready) and all heavy
 *   directing/editing/vision tasks on the user's local server at 0 Motionpop credits — even offline.
 * - With BYOK key saved in browser: `geminiByokProvider` sending cloud requests directly to
 *   Google AI Studio (`x-goog-api-key` header) while STILL trying on-device Gemini Nano first.
 * - Default: Firebase AI Logic provider (on-device Gemini Nano + cloud Gemini) + Remote Config.
 * - `null` when none of the above is configured (local mode); callers use deterministic fallbacks.
 */
export type RouterTarget = 'default' | 'nano' | 'local-llm' | 'cloud';

let routerPromise: Promise<Router | null> | null = null;
let nanoRouterPromise: Promise<Router | null> | null = null;
let localOnlyRouterPromise: Promise<Router | null> | null = null;
let cloudRouterPromise: Promise<Router | null> | null = null;
const listeners = new Set<(e: UsageEvent) => void>();

export function onAIUsage(fn: (e: UsageEvent) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Tells every listener about a usage event (the router calls it; dev and test builds can too). */
export function emitAIUsage(e: UsageEvent): void {
  listeners.forEach((l) => l(e));
}

/** Drops the cached routers so the next call rebuilds with the latest provider state. */
export function resetRouter(): void {
  routerPromise = null;
  nanoRouterPromise = null;
  localOnlyRouterPromise = null;
  cloudRouterPromise = null;
}

// Automatically swap the router when the user updates Local LLM or BYOK settings.
subscribeByok(resetRouter);
subscribeLocalLlm(resetRouter);

function currentRouterKind() {
  return routerKind(
    {
      NODE_ENV: process.env.NODE_ENV,
      NEXT_PUBLIC_FAKE_AI: process.env.NEXT_PUBLIC_FAKE_AI,
    },
    firebaseEnabled(),
  );
}

async function resolveOnDeviceProvider(): Promise<AIProvider> {
  if (!firebaseEnabled()) return chromeOnDeviceProvider();
  try {
    const { firebaseProvider } = await import('@motionpop/ai/firebase');
    return firebaseProvider(getAILogic);
  } catch {
    // Cold-offline chunk-load fallback so Chrome Gemini Nano still runs offline.
    return chromeOnDeviceProvider();
  }
}

async function buildCloudRouter(): Promise<Router | null> {
  const kind = currentRouterKind();
  if (kind === 'fake') {
    return createFakeRouter({
      search: typeof window === 'undefined' ? '' : window.location.search,
      onUsage: emitAIUsage,
    });
  }
  const byokKey = getByokKey();
  if (byokKey) {
    const [loaded, onDevice] = await Promise.all([
      firebaseEnabled()
        ? loadAppConfig().catch(() => ({ config: APP_CONFIG_DEFAULTS }))
        : Promise.resolve({ config: APP_CONFIG_DEFAULTS }),
      resolveOnDeviceProvider(),
    ]);
    return createRouter({
      provider: geminiByokProvider({
        apiKey: byokKey,
        onDevice,
        modelMode: getByokModelMode(),
        customModel: getByokModel(),
      }),
      config: () => loaded.config,
      onUsage: (e) => emitAIUsage({ ...e, credits: 0 }),
      cache: idbRouterCache(),
    });
  }
  if (kind === 'none') return null;
  const [{ config }, provider] = await Promise.all([
    loadAppConfig().catch(() => ({ config: APP_CONFIG_DEFAULTS })),
    resolveOnDeviceProvider(),
  ]);
  return createRouter({
    provider,
    config: () => config,
    onUsage: emitAIUsage,
    cache: idbRouterCache(),
  });
}

export function getRouter(): Promise<Router | null> {
  routerPromise ??= (async () => {
    const kind = currentRouterKind();
    if (kind === 'fake') {
      return createFakeRouter({
        search: typeof window === 'undefined' ? '' : window.location.search,
        onUsage: emitAIUsage,
      });
    }

    const localCfg = getLocalLlmConfig();
    if (localCfg) {
      const onDevice = await resolveOnDeviceProvider();
      return createRouter({
        provider: localLlmProvider({
          baseUrl: localCfg.baseUrl,
          model: localCfg.model,
          apiKey: localCfg.apiKey,
          onDevice,
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

    return buildCloudRouter();
  })().catch((err: unknown) => {
    routerPromise = null; // let the next call retry
    throw err;
  });
  return routerPromise;
}

/**
 * Returns a router pinned to a specific provider target:
 * - `'default'`: normal hybrid router (`getRouter()`).
 * - `'nano'`: strictly Chrome's on-device Gemini Nano via Firebase AI Logic (`firebaseProvider`),
 *   falling back to `chromeOnDeviceProvider()` when Firebase is disabled or chunks cannot load offline.
 * - `'local-llm'`: strictly the user's configured Ollama / LM Studio server (no Nano intercept).
 * - `'cloud'`: bypasses Local LLM and routes directly to Cloud Gemini (BYOK or Firebase AI Logic).
 */
export function getRouterFor(target: RouterTarget): Promise<Router | null> {
  if (target === 'default') return getRouter();
  const kind = currentRouterKind();
  if (kind === 'fake') return getRouter();

  if (target === 'nano') {
    nanoRouterPromise ??= (async () => {
      const [loaded, provider] = await Promise.all([
        firebaseEnabled()
          ? loadAppConfig().catch(() => ({ config: APP_CONFIG_DEFAULTS }))
          : Promise.resolve({ config: APP_CONFIG_DEFAULTS }),
        resolveOnDeviceProvider(),
      ]);
      return createRouter({
        provider,
        config: () => ({ ...loaded.config, killSwitch: false }),
        onUsage: (e) => emitAIUsage({ ...e, credits: 0, ranOn: 'device' }),
        cache: idbRouterCache(),
      });
    })().catch((err: unknown) => {
      nanoRouterPromise = null;
      throw err;
    });
    return nanoRouterPromise;
  }

  if (target === 'local-llm') {
    const localCfg = getLocalLlmConfig();
    if (!localCfg) return Promise.resolve(null);
    localOnlyRouterPromise ??= Promise.resolve(
      createRouter({
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
      }),
    );
    return localOnlyRouterPromise;
  }

  // target === 'cloud': explicitly bypass Local LLM to reach BYOK or Firebase Cloud Gemini.
  cloudRouterPromise ??= buildCloudRouter().catch((err: unknown) => {
    cloudRouterPromise = null;
    throw err;
  });
  return cloudRouterPromise;
}
