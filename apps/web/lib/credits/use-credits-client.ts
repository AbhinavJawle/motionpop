'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { useByok } from '../ai/byok';
import { useLocalLlm } from '../ai/local-llm';
import { useAuth, type AuthUser } from '../auth/auth-provider';
import { firebaseEnabled } from '../firebase/client';
import { apiHeaders, bootstrapCurrentUser } from '../users/bootstrap-client';
import { ByokCredits } from './byok-credits';
import type { CreditsClient } from './client';
import { userStore } from './firestore-listen';
import { LocalCredits } from './local-credits';
import { LocalLlmCredits } from './local-llm-credits';
import { fakeAiFlag, pickCreditsClient, type CreditsPick } from './pick-client';
import { ServerCredits } from './server-credits';

let local: LocalCredits | undefined;
const servers = new Map<string, ServerCredits>();
const byokWrappers = new WeakMap<CreditsClient, ByokCredits>();
let standaloneByok: ByokCredits | undefined;
const localLlmWrappers = new WeakMap<CreditsClient, LocalLlmCredits>();
let standaloneLocalLlm: LocalLlmCredits | undefined;

function byokCreditsFor(inner: CreditsClient | null): ByokCredits {
  if (!inner) return (standaloneByok ??= new ByokCredits(null));
  let wrapped = byokWrappers.get(inner);
  if (!wrapped) {
    wrapped = new ByokCredits(inner);
    byokWrappers.set(inner, wrapped);
  }
  return wrapped;
}

function localLlmCreditsFor(inner: CreditsClient | null): LocalLlmCredits {
  if (!inner) return (standaloneLocalLlm ??= new LocalLlmCredits(null));
  let wrapped = localLlmWrappers.get(inner);
  if (!wrapped) {
    wrapped = new LocalLlmCredits(inner);
    localLlmWrappers.set(inner, wrapped);
  }
  return wrapped;
}

function serverCreditsFor(user: AuthUser): ServerCredits {
  let c = servers.get(user.uid);
  if (!c) {
    c = new ServerCredits({
      fetch: (...a) => fetch(...a),
      headers: () => apiHeaders(user.getIdToken),
      rebootstrap: async () => {
        await bootstrapCurrentUser(user.getIdToken);
      },
      readBalance: () => userStore.get(user.uid).balance,
      subscribeBalance: (fn) => userStore.subscribe(user.uid, fn),
      setBalance: (b) => userStore.setBalance(user.uid, b),
      isOnline: () => navigator.onLine,
    });
    servers.set(user.uid, c);
  }
  return c;
}

export interface UseCreditsClient {
  client: CreditsClient | null;
  /** Underlying real cloud credits client (BYOK or ServerCredits), bypassing LocalLlmCredits. */
  cloudClient?: CreditsClient | null;
  cloudAvailable: boolean;
  /** True when real cloud AI (Firebase or BYOK) is available, independent of Local LLM. */
  realCloudAvailable?: boolean;
  /** Why cloud actions are disabled (tooltip copy), or null. */
  cloudBlockedReason: string | null;
  /** Blocked reason for real cloud AI when bypassing Local LLM. */
  realCloudBlockedReason?: string | null;
  /** True when cloud Gemini calls are routed through the user's browser-local API key (0 credits). */
  byok?: boolean;
  /** True when routed text/JSON AI tasks run through a browser-local Ollama/LM Studio server (0 credits). */
  localLlm?: boolean;
  /** True when the session can pay for cloud-only media (TTS / images) via account credits or BYOK. */
  hasAccountCredits?: boolean;
}

/**
 * The credits client for this session (spec 13 task 8; spec 42 BYOK; local LLM). `ServerCredits`
 * with Firebase and a signed-in user; `LocalCredits` only without Firebase or with
 * `NEXT_PUBLIC_FAKE_AI=1`; when a browser-local Gemini API key or Ollama/LM Studio provider is
 * enabled (outside fake-AI mode), the active client is wrapped so covered AI calls run at 0
 * Motionpop credits while cloud-only media (TTS/image) still enforce credits when BYOK is absent.
 */
export function useCreditsClient(): UseCreditsClient {
  const auth = useAuth();
  const { active: byokActive } = useByok();
  const { active: localLlmActive } = useLocalLlm();
  const user = auth.status === 'signed-in' ? auth.user : null;
  const fakeAi = fakeAiFlag({
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_FAKE_AI: process.env.NEXT_PUBLIC_FAKE_AI,
  });
  const pick: CreditsPick = pickCreditsClient({
    firebaseEnabled: firebaseEnabled(),
    fakeAi,
    signedIn: user !== null,
  });
  // Both clients are cached (one LocalCredits, one ServerCredits per uid), so the identity is
  // stable across renders without memoising.
  let client: CreditsClient | null = null;
  if (pick.client === 'local') client = local ??= new LocalCredits();
  else if (pick.client === 'server' && user) client = serverCreditsFor(user);

  if (localLlmActive && !fakeAi) {
    const base = byokActive ? byokCreditsFor(client) : client;
    return {
      client: localLlmCreditsFor(base),
      cloudClient: base,
      cloudAvailable: true,
      realCloudAvailable: byokActive || pick.cloudAvailable,
      cloudBlockedReason: null,
      realCloudBlockedReason: byokActive ? null : pick.cloudBlockedReason,
      byok: byokActive,
      localLlm: true,
      hasAccountCredits: byokActive || client !== null,
    };
  }
  if (byokActive && !fakeAi) {
    const wrapped = byokCreditsFor(client);
    return {
      client: wrapped,
      cloudClient: wrapped,
      cloudAvailable: true,
      realCloudAvailable: true,
      cloudBlockedReason: null,
      realCloudBlockedReason: null,
      byok: true,
      localLlm: false,
      hasAccountCredits: true,
    };
  }
  return {
    client,
    cloudClient: client,
    cloudAvailable: pick.cloudAvailable,
    realCloudAvailable: pick.cloudAvailable,
    cloudBlockedReason: pick.cloudBlockedReason,
    realCloudBlockedReason: pick.cloudBlockedReason,
    byok: false,
    localLlm: false,
    hasAccountCredits: client !== null,
  };
}

/**
 * The balance the chips show: null while unknown (soft shimmer, R5.4). In local mode it is the
 * `LocalCredits` balance (120 at the start).
 */
export function useCreditsBalance(): number | null {
  const { client } = useCreditsClient();
  const subscribe = useCallback(
    (fn: () => void) => (client ? client.subscribe(fn) : () => {}),
    [client],
  );
  return useSyncExternalStore(
    subscribe,
    () => client?.balance() ?? null,
    () => null,
  );
}
