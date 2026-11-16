'use client';

import { useEffect } from 'react';
import { emitAIUsage } from '@/lib/ai/router-client';
import { useCreditsClient } from '@/lib/credits/use-credits-client';
import { spendWithUi } from '@/lib/credits/spend-with-ui';

/**
 * Dev and test builds only (never in production): `window.__credits` and `window.__emitUsage`, so
 * the credits e2e can drive the real client (`ServerCredits` → routes → ledger → live balance)
 * before the screens that spend (spec 09) exist. Renders nothing.
 */
export function CreditsTestHooks() {
  const { client } = useCreditsClient();
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    const w = window as unknown as Record<string, unknown>;
    w['__emitUsage'] = emitAIUsage;
    if (!client) return;
    w['__credits'] = {
      spend: (req: Parameters<typeof spendWithUi>[1]) => spendWithUi(client, req),
      refund: (txId: string) => client.refund(txId),
      balance: () => client.balance(),
    };
    return () => {
      delete w['__credits'];
    };
  }, [client]);
  return null;
}
