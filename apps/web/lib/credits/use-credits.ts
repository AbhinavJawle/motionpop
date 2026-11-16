'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { useAuth } from '../auth/auth-provider';
import { userStore } from './firestore-listen';
import { EMPTY_USER, type UserSnapshot } from './user-store';

/**
 * The signed-in user's live balance, plan and settings from `users/{uid}` (spec 13 R5.1). Every
 * field is null while loading, signed out or in local mode. This is the one hook for the editor
 * chip, the export modal (`useCreditBalance`), the dashboard chip and Settings.
 */
export function useCredits(): UserSnapshot {
  const auth = useAuth();
  const uid = auth.status === 'signed-in' ? auth.user.uid : null;
  const subscribe = useCallback(
    (fn: () => void) => (uid ? userStore.subscribe(uid, fn) : () => {}),
    [uid],
  );
  const get = useCallback(() => (uid ? userStore.get(uid) : EMPTY_USER), [uid]);
  return useSyncExternalStore(subscribe, get, () => EMPTY_USER);
}
