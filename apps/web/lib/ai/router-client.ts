import { createRouter, type Router, type UsageEvent } from '@motionpop/ai';
import { firebaseEnabled, getAILogic } from '@/lib/firebase/client';
import { createFakeRouter, routerKind } from './fake-router';
import { loadAppConfig } from '@/lib/firebase/remote-config';
import { idbRouterCache } from './idb-cache';

/**
 * The browser's AI router (hybrid-ai.md): Firebase AI Logic provider + Remote Config routing.
 * `null` when Firebase isn't configured (local mode); callers then use their deterministic
 * fallbacks. Usage events go to in-memory listeners for now. Persisting them to
 * `users/{uid}/usage` needs a server route because the rules block client writes (spec 13).
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
