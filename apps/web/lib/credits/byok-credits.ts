import type { CreditsClient, SpendRequestInput, SpendResult } from './client';

/**
 * Zero-cost CreditsClient wrapper active when the user supplies their own Gemini API key
 * (Spec 42 BYOK). Preserves live balance display by delegating `balance()` and `subscribe()` to
 * the underlying client (if signed in), while resolving Gemini cloud spends locally at 0 credits
 * without touching `/api/credits/spend`.
 */
export class ByokCredits implements CreditsClient {
  readonly isByok = true;
  private readonly inner: CreditsClient | null;

  constructor(inner: CreditsClient | null) {
    this.inner = inner;
  }

  balance(): number | null {
    return this.inner?.balance() ?? null;
  }

  subscribe(fn: (balance: number | null) => void): () => void {
    return this.inner ? this.inner.subscribe(fn) : () => {};
  }

  async spend(req: SpendRequestInput): Promise<SpendResult> {
    return {
      ok: true,
      txId: `byok-${req.key}`,
      balance: this.inner?.balance() ?? 0,
      cost: 0,
    };
  }

  async refund(txId: string): Promise<void> {
    // Nothing was charged on Motionpop's ledger.
    void txId;
  }
}
