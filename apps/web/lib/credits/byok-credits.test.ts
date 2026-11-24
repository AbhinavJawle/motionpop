import { describe, expect, it, vi } from 'vitest';
import { ByokCredits } from './byok-credits';
import type { CreditsClient } from './client';
import { spendWithUi } from './spend-with-ui';

describe('ByokCredits', () => {
  it('delegates balance/subscribe to inner client while resolving spend at 0 credits without calling inner spend', async () => {
    const innerSpend = vi.fn();
    const innerRefund = vi.fn();
    const inner: CreditsClient = {
      balance: () => 0,
      subscribe: () => () => {},
      spend: innerSpend,
      refund: innerRefund,
    };

    const byok = new ByokCredits(inner);
    expect(byok.isByok).toBe(true);
    expect(byok.balance()).toBe(0);

    // Even at 0 Motionpop balance, spendWithUi succeeds at 0 cost and never hits the server client.
    const res = await spendWithUi(byok, { action: 'generate', key: 'testkey12345' });
    expect(res).toEqual({
      ok: true,
      txId: 'byok-testkey12345',
      balance: 0,
      cost: 0,
    });
    expect(innerSpend).not.toHaveBeenCalled();

    await byok.refund('byok-testkey12345');
    expect(innerRefund).not.toHaveBeenCalled();
  });

  it('works cleanly with no underlying client (signed out / local mode)', async () => {
    const byok = new ByokCredits(null);
    expect(byok.balance()).toBeNull();
    const res = await spendWithUi(byok, { action: 'tts', units: 2, key: 'ttskey12345' });
    expect(res).toEqual({
      ok: true,
      txId: 'byok-ttskey12345',
      balance: 0,
      cost: 0,
    });
  });
});
