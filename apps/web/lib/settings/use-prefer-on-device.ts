'use client';

import { DEFAULT_USER_SETTINGS, type UserSettings } from '@motionpop/schemas';
import { useCallback, useState, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../auth/auth-provider';
import { useCredits } from '../credits/use-credits';
import { getDb } from '../firebase/client';
import { userStore } from '../credits/firestore-listen';

/**
 * `settings.preferOnDevice` (spec 13 R6.3, R6.5): "Prefer on-device AI", default on.
 * Signed in, it lives in `users/{uid}.settings` (written by the client under the rules, which
 * require the whole valid map). In local mode (no Firebase) it lives in `localStorage`.
 */
export const LOCAL_SETTINGS_KEY = 'motionpop.settings';
export const SAVE_FAILED_COPY = "Couldn't save that setting.";

export function parseLocalSettings(raw: string | null): UserSettings {
  if (!raw) return DEFAULT_USER_SETTINGS;
  try {
    const v = JSON.parse(raw) as Partial<UserSettings> | null;
    return {
      ...DEFAULT_USER_SETTINGS,
      ...(typeof v?.preferOnDevice === 'boolean' ? { preferOnDevice: v.preferOnDevice } : {}),
    };
  } catch {
    return DEFAULT_USER_SETTINGS;
  }
}

const localListeners = new Set<() => void>();
const subscribeLocal = (fn: () => void) => {
  localListeners.add(fn);
  window.addEventListener('storage', fn);
  return () => {
    localListeners.delete(fn);
    window.removeEventListener('storage', fn);
  };
};
const readLocal = (): boolean =>
  parseLocalSettings(window.localStorage.getItem(LOCAL_SETTINGS_KEY)).preferOnDevice;

/** The toggle's value and a saver that reverts and toasts when the write fails. */
export function usePreferOnDevice(): {
  /** The saved value, or the one just clicked while it saves (the default is on). */
  preferOnDevice: boolean;
  loaded: boolean;
  save: (next: boolean) => Promise<boolean>;
} {
  const auth = useAuth();
  const { settings } = useCredits();
  const local = useSyncExternalStore(subscribeLocal, readLocal, () => true);
  const uid = auth.status === 'signed-in' ? auth.user.uid : null;
  // Founder, 2026-11-16: the toggle froze when `users/{uid}` had no parseable settings (it waited
  // for them forever). Without server settings it now works from localStorage, and a click shows
  // the new value at once (optimistic), reverting only if the write fails.
  const serverBacked = uid !== null && settings !== null;
  const [pending, setPending] = useState<boolean | null>(null);

  const save = useCallback(
    async (next: boolean): Promise<boolean> => {
      setPending(next);
      if (!serverBacked || !uid) {
        window.localStorage.setItem(
          LOCAL_SETTINGS_KEY,
          JSON.stringify({
            ...parseLocalSettings(window.localStorage.getItem(LOCAL_SETTINGS_KEY)),
            preferOnDevice: next,
          }),
        );
        for (const l of localListeners) l();
        setPending(null);
        return true;
      }
      const current = userStore.get(uid).settings ?? DEFAULT_USER_SETTINGS;
      try {
        const db = await getDb();
        const { doc, updateDoc } = await import('firebase/firestore');
        await updateDoc(doc(db, 'users', uid), { settings: { ...current, preferOnDevice: next } });
        return true;
      } catch {
        toast.error(SAVE_FAILED_COPY);
        return false;
      } finally {
        setPending(null);
      }
    },
    [uid, serverBacked],
  );

  const saved = serverBacked ? (settings?.preferOnDevice ?? true) : local;
  return { preferOnDevice: pending ?? saved, loaded: auth.status !== 'loading', save };
}
