'use client';

import { DailyLimitsSchema } from '@motionpop/schemas';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useAuth } from '../auth/auth-provider';
import { getDb } from '../firebase/client';
import {
  USAGE_DAYS,
  aggregateUsage,
  windowDays,
  type UsageDay,
  type UsageSummary,
} from './aggregate';
import { getSessionUsage, subscribeSessionUsage } from './usage-store';

export interface UsageView {
  status: 'loading' | 'ready' | 'error';
  summary: UsageSummary;
  /** "account" = the last 14 days; "session" = local mode, this session only (R7.4). */
  scope: 'account' | 'session';
}

const utcToday = (): string => new Date().toISOString().slice(0, 10);

/**
 * Settings' chart data. Signed in: at most 14 small `limits` docs by a document-id range (never
 * the event documents, R7.5). Local mode: the session's counters.
 */
export function useUsageSummary(refreshKey: unknown): UsageView {
  const auth = useAuth();
  const uid = auth.status === 'signed-in' ? auth.user.uid : null;
  const session = useSyncExternalStore(subscribeSessionUsage, getSessionUsage, getSessionUsage);
  const [loaded, setLoaded] = useState<{ uid: string; days: UsageDay[] } | 'error' | null>(null);

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    void (async () => {
      try {
        const db = await getDb();
        const { collection, documentId, getDocs, limit, orderBy, query, where } =
          await import('firebase/firestore');
        const first = windowDays(utcToday())[0] ?? utcToday();
        const snap = await getDocs(
          query(
            collection(db, 'users', uid, 'limits'),
            where(documentId(), '>=', first),
            orderBy(documentId()),
            limit(USAGE_DAYS),
          ),
        );
        const days = snap.docs.flatMap((d) => {
          const parsed = DailyLimitsSchema.safeParse(d.data());
          return parsed.success ? [{ day: d.id, usage: parsed.data.usage }] : [];
        });
        if (!cancelled) setLoaded({ uid, days });
      } catch {
        if (!cancelled) setLoaded('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid, refreshKey]);

  return useMemo<UsageView>(() => {
    const today = utcToday();
    if (!uid) {
      return {
        status: auth.status === 'loading' ? 'loading' : 'ready',
        scope: 'session',
        summary: aggregateUsage([{ day: today, usage: session }], today),
      };
    }
    if (loaded === 'error') {
      return { status: 'error', scope: 'account', summary: aggregateUsage([], today) };
    }
    if (loaded === null || loaded.uid !== uid) {
      return { status: 'loading', scope: 'account', summary: aggregateUsage([], today) };
    }
    return { status: 'ready', scope: 'account', summary: aggregateUsage(loaded.days, today) };
  }, [uid, auth.status, loaded, session]);
}
