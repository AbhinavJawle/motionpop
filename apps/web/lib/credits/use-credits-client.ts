'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { useByok } from '../ai/byok';
import { useAuth, type AuthUser } from '../auth/auth-provider';
import { firebaseEnabled } from '../firebase/client';
import { apiHeaders, bootstrapCurrentUser } from '../users/bootstrap-client';
import { ByokCredits } from './byok-credits';
import type { CreditsClient } from './client';
import { userStore } from './firestore-listen';
import { LocalCredits } from './local-credits';
import { fakeAiFlag, pickCreditsClient, type CreditsPick } from './pick-client';
import { ServerCredits } from './server-credits';

let local: LocalCredits | undefined;
const servers = new Map<string, ServerCredits>();
const byokWrappers = new WeakMap<CreditsClient, ByokCredits>();
let standaloneByok: ByokCredits | undefined;

function byokCreditsFor(inner: CreditsClient | null): ByokCredits {
  if (!inner) return (standaloneByok ??= new ByokCredits(null));
  let wrapped = byokWrappers.get(inner);
  if (!wrapped) {
    wrapped = new ByokCredits(inner);
    byokWrappers.set(inner, wrapped);
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
  cloudAvailable: boolean;
  /** Why cloud actions are disabled (tooltip copy), or null. */
  cloudBlockedReason: string | null;
  /** True when cloud Gemini calls are routed through the user's browser-local API key (0 credits). */
  byok?: boolean;
}

/**
 * The credits client for this session (spec 13 task 8; spec 42 BYOK). `ServerCredits` with
 * Firebase and a signed-in user; `LocalCredits` only without Firebase or with
 * `NEXT_PUBLIC_FAKE_AI=1`; when a browser-local Gemini API key is saved (outside fake-AI mode),
 * `ByokCredits` wraps the active client so cloud Gemini calls run at 0 Motionpop credits.
 */
export function useCreditsClient(): UseCreditsClient {
  const auth = useAuth();
  const { active: byokActive } = useByok();
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

  if (byokActive && !fakeAi) {
    return {
      client: byokCreditsFor(client),
      cloudAvailable: true,
      cloudBlockedReason: null,
      byok: true,
    };
  }
  return {
    client,
    cloudAvailable: pick.cloudAvailable,
    cloudBlockedReason: pick.cloudBlockedReason,
    byok: false,
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
