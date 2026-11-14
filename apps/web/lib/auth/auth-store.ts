import { firebaseEnabled, getAuthClient } from '../firebase/client';

export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  /** Fresh Firebase ID token for `Authorization: Bearer` on our API routes. */
  getIdToken: () => Promise<string>;
}

/**
 * - `loading`: waiting for Firebase to restore the session (also the server snapshot).
 * - `local`: Firebase isn't configured (tests, offline dev). Everything stays on this device and
 *   protected routes open without an account.
 */
export type AuthState =
  | { status: 'loading' }
  | { status: 'local' }
  | { status: 'signed-out' }
  | { status: 'signed-in'; user: AuthUser };

export const LOADING: AuthState = { status: 'loading' };

/**
 * Module-level auth store for `useSyncExternalStore`. It starts listening to Firebase on the
 * first subscription and keeps listening for the life of the page.
 */
let state: AuthState = LOADING;
let started = false;
const listeners = new Set<() => void>();

function set(next: AuthState): void {
  state = next;
  for (const l of listeners) l();
}

function start(): void {
  if (started) return;
  started = true;
  if (!firebaseEnabled()) {
    // Deferred so subscribers never see a change during their own subscribe call.
    queueMicrotask(() => set({ status: 'local' }));
    return;
  }
  void (async () => {
    try {
      const auth = await getAuthClient();
      const { onAuthStateChanged } = await import('firebase/auth');
      onAuthStateChanged(auth, (u) =>
        set(
          u
            ? {
                status: 'signed-in',
                user: {
                  uid: u.uid,
                  email: u.email,
                  displayName: u.displayName,
                  photoURL: u.photoURL,
                  getIdToken: () => u.getIdToken(),
                },
              }
            : { status: 'signed-out' },
        ),
      );
    } catch (err) {
      // Firebase failed to start (blocked script, bad config): treat as signed out so the
      // sign-in screen can show what's wrong instead of spinning forever.
      console.error('Auth failed to start', err);
      set({ status: 'signed-out' });
    }
  })();
}

export function subscribeAuth(listener: () => void): () => void {
  listeners.add(listener);
  start();
  return () => listeners.delete(listener);
}

export const getAuthSnapshot = (): AuthState => state;
export const getServerAuthSnapshot = (): AuthState => LOADING;
