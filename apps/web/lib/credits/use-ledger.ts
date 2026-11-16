'use client';

import { CreditTxSchema, type CreditTx } from '@motionpop/schemas';
import { useEffect, useState } from 'react';
import { useAuth } from '../auth/auth-provider';
import { getDb } from '../firebase/client';

export interface LedgerRow extends CreditTx {
  id: string;
}

export type LedgerState =
  | { status: 'loading' }
  | { status: 'ready'; rows: LedgerRow[] }
  | { status: 'error' }
  | { status: 'none' };

/** The last 20 ledger rows (`orderBy('at', 'desc')`, `limit(20)`): at most 20 reads (spec 13 NFR). */
export const LEDGER_ROWS = 20;

/** Reads the ledger once when Settings opens; `refreshKey` re-reads after a balance change. */
export function useLedger(refreshKey: unknown): LedgerState {
  const auth = useAuth();
  const uid = auth.status === 'signed-in' ? auth.user.uid : null;
  const [state, setState] = useState<{ uid: string; value: LedgerState } | null>(null);

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    void (async () => {
      try {
        const db = await getDb();
        const { collection, getDocs, limit, orderBy, query } = await import('firebase/firestore');
        const snap = await getDocs(
          query(collection(db, 'users', uid, 'credits'), orderBy('at', 'desc'), limit(LEDGER_ROWS)),
        );
        const rows = snap.docs.flatMap((d) => {
          const parsed = CreditTxSchema.safeParse(d.data());
          return parsed.success ? [{ id: d.id, ...parsed.data }] : [];
        });
        if (!cancelled) setState({ uid, value: { status: 'ready', rows } });
      } catch {
        if (!cancelled) setState({ uid, value: { status: 'error' } });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid, refreshKey]);

  if (!uid) return auth.status === 'loading' ? { status: 'loading' } : { status: 'none' };
  return state?.uid === uid ? state.value : { status: 'loading' };
}
