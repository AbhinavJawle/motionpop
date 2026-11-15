import { createRouter, type Router, type UsageEvent } from '@motionpop/ai';
import { firebaseEnabled, getAILogic } from '@/lib/firebase/client';
import { loadAppConfig } from '@/lib/firebase/remote-config';

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

export function getRouter(): Promise<Router | null> {
  routerPromise ??= (async () => {
    if (!firebaseEnabled()) return null;
    const [{ config }, { firebaseProvider }] = await Promise.all([
      loadAppConfig(),
      import('@motionpop/ai/firebase'),
    ]);
    return createRouter({
      provider: firebaseProvider(getAILogic),
      config: () => config,
      onUsage: (e) => listeners.forEach((l) => l(e)),
    });
  })().catch((err: unknown) => {
    routerPromise = null; // let the next call retry
    throw err;
  });
  return routerPromise;
}
