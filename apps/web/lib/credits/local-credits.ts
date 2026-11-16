import { APP_CONFIG_DEFAULTS, costOf, spendTxId, type CostConfig } from '@motionpop/schemas';
import type { CreditsClient, SpendRequestInput, SpendResult } from './client';

/** The design's chip shows 120; local mode and the fake router start there (demo only). */
export const LOCAL_START_BALANCE = 120;

interface Entry {
  cost: number;
  balance: number;
  refunded: boolean;
}

/**
 * In-memory credits that behave like the server (spec 09 design): the spend id is `s-{key}`, a
 * repeated key answers the first result, a refunded key answers `key-used`, a refund pays once,
 * and the balance never goes below zero. Resets on reload. Never used with Firebase configured
 * outside `NEXT_PUBLIC_FAKE_AI=1`.
 */
export class LocalCredits implements CreditsClient {
  private current: number;
  private readonly entries = new Map<string, Entry>();
  private readonly listeners = new Set<(b: number | null) => void>();

  constructor(
    start: number = LOCAL_START_BALANCE,
    private readonly cfg: CostConfig = APP_CONFIG_DEFAULTS,
  ) {
    this.current = start;
  }

  balance(): number | null {
    return this.current;
  }

  subscribe(fn: (balance: number | null) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private set(next: number): void {
    this.current = next;
    for (const l of this.listeners) l(next);
  }

  spend(req: SpendRequestInput): Promise<SpendResult> {
    const txId = spendTxId(req.key);
    const existing = this.entries.get(txId);
    if (existing) {
      if (existing.refunded)
        return Promise.resolve({ ok: false, reason: 'key-used', balance: this.current });
      return Promise.resolve({ ok: true, txId, balance: existing.balance, cost: existing.cost });
    }
    const cost = costOf(req.action, req.units ?? 1, this.cfg);
    if (this.current < cost) {
      return Promise.resolve({ ok: false, reason: 'insufficient', balance: this.current });
    }
    this.set(this.current - cost);
    this.entries.set(txId, { cost, balance: this.current, refunded: false });
    return Promise.resolve({ ok: true, txId, balance: this.current, cost });
  }

  refund(txId: string): Promise<void> {
    const entry = this.entries.get(txId);
    if (entry && !entry.refunded) {
      entry.refunded = true;
      this.set(this.current + entry.cost);
    }
    return Promise.resolve();
  }
}
