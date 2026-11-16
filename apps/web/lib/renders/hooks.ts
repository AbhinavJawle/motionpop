'use client';

import { APP_CONFIG_DEFAULTS, type AppConfig } from '@motionpop/schemas';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useAuth } from '../auth/auth-provider';
import { firebaseEnabled, getDb } from '../firebase/client';
import { useCredits } from '../credits/use-credits';
import { loadAppConfig } from '../firebase/remote-config';
import { renderClientFor, toView, type RenderClient, type RenderView } from './render-client';

// Hooks of the export flow (spec 08 design §12): the live balance, the active render, the app
// config, the connection state and the job watcher with its 45 s check.

/** Seconds without a change before the client asks the server to sweep (R4.6). */
export const NO_CHANGE_CHECK_MS = 45_000;

/**
 * The signed-in user's credits, live from `users/{uid}` (spec 13: this is `useCredits().balance`).
 * Null while loading, signed out, or in local mode (no Firebase).
 */
export function useCreditBalance(): number | null {
  return useCredits().balance;
}

/** The caller's active render, if any (a reload during a render shows its progress again). */
export function useActiveRender(): RenderView | null {
  const auth = useAuth();
  const uid = auth.status === 'signed-in' ? auth.user.uid : null;
  const [found, setFound] = useState<RenderView | null>(null);
  useEffect(() => {
    if (!uid) return;
    let stop: (() => void) | undefined;
    let cancelled = false;
    void (async () => {
      try {
        const db = await getDb();
        const { collection, limit, onSnapshot, query, where } = await import('firebase/firestore');
        if (cancelled) return;
        stop = onSnapshot(
          query(
            collection(db, 'renders'),
            where('ownerId', '==', uid),
            where('status', 'in', ['queued', 'rendering', 'encoding']),
            limit(1),
          ),
          (snap) => {
            const d = snap.docs[0];
            setFound(d ? toView(d.id, d.data()) : null);
          },
          () => {},
        );
      } catch {
        // Offline or blocked: no active render is shown.
      }
    })();
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [uid]);
  return uid ? found : null;
}

let configPromise: Promise<AppConfig> | undefined;

/** The app config (Remote Config with typed defaults), fetched once per page load. */
export function useAppConfig(): AppConfig {
  const [config, setConfig] = useState<AppConfig>(APP_CONFIG_DEFAULTS);
  useEffect(() => {
    let cancelled = false;
    configPromise ??= loadAppConfig().then((r) => r.config);
    void configPromise.then((c) => {
      if (!cancelled) setConfig(c);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return config;
}

const subscribeOnline = (cb: () => void) => {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
};

/** `navigator.onLine`, live. True on the server. */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

/** The render client of this page load: cloud (or emulator) when Firebase is configured. */
export function useRenderClient(): RenderClient {
  return useMemo(() => renderClientFor(firebaseEnabled()), []);
}

/**
 * Follows one render. Calls `onView` for every change; when nothing changes for 45 s while the
 * render is active it asks the server to check it (the sweep refunds a stalled render).
 */
export function useRenderJob(
  client: RenderClient,
  renderId: string | null,
  onView: (view: RenderView) => void,
  noChangeMs: number = NO_CHANGE_CHECK_MS,
): { lost: boolean } {
  const [lostId, setLostId] = useState<string | null>(null);
  const onViewRef = useRef(onView);
  useEffect(() => {
    onViewRef.current = onView;
  });

  useEffect(() => {
    if (!renderId) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let finished = false;
    const arm = () => {
      if (timer) clearTimeout(timer);
      if (finished) return;
      timer = setTimeout(() => {
        void client
          .check(renderId)
          .then((v) => {
            if (v) {
              onViewRef.current(v);
              if (v.status === 'done' || v.status === 'error') finished = true;
            }
          })
          .catch(() => {})
          .finally(arm);
      }, noChangeMs);
    };
    let last = '';
    const stop = client.watch(
      renderId,
      (v) => {
        const key = `${v.status}:${v.progress}`;
        if (v.status === 'done' || v.status === 'error') finished = true;
        if (key !== last) {
          last = key;
          arm();
        }
        onViewRef.current(v);
      },
      () => setLostId(renderId),
    );
    arm();
    return () => {
      finished = true;
      if (timer) clearTimeout(timer);
      stop();
    };
  }, [client, renderId, noChangeMs]);

  return { lost: renderId !== null && lostId === renderId };
}
