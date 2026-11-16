// An in-memory ledger built only from the pure decisions (`decideSpend`, `decideRefund`). It is
// the model the property tests compare against (spec 13 C1, C3–C6), and spec 13 task 5b runs
// the same operations against the emulator.
import {
  MAX_REFUND_AGE_MS,
  decideRefund,
  decideSpend,
  refundIdOf,
  type RefundDecision,
  type SpendDecision,
  type SpendKind,
} from '../store/ledger-logic';

export interface ModelEntry {
  id: string;
  delta: number;
  reason: 'spend' | 'refund' | 'judge-grant' | 'signup';
  balanceAfter: number;
  atMs: number;
}

export interface ModelConfig {
  hourLimit: number;
  refundsPerDay: number;
  killSwitch: boolean;
  /** Present for a judge account. */
  judgeCredits: number | null;
}

export const utcDay = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
export const utcHour = (ms: number): string => new Date(ms).toISOString().slice(0, 13);

export class LedgerModel {
  balance: number;
  readonly entries: ModelEntry[] = [];
  readonly grant: number;
  private readonly hourCounts = new Map<string, number>();
  private readonly refundCounts = new Map<string, number>();

  constructor(
    grant: number,
    public cfg: ModelConfig,
  ) {
    this.grant = grant;
    this.balance = grant;
  }

  entry(id: string): ModelEntry | undefined {
    return this.entries.find((e) => e.id === id);
  }

  aiSpendsInHour(ms: number): number {
    return this.hourCounts.get(utcHour(ms)) ?? 0;
  }

  spend(spendId: string, kind: SpendKind, cost: number, nowMs: number): SpendDecision {
    const existing = this.entry(spendId);
    const refillId = `judge-refill-${utcDay(nowMs)}`;
    const d = decideSpend({
      kind,
      balance: this.balance,
      cost,
      existing: existing ? { delta: existing.delta, balanceAfter: existing.balanceAfter } : null,
      refunded: this.entry(refundIdOf(spendId)) !== undefined,
      killSwitch: this.cfg.killSwitch,
      hourCount: this.aiSpendsInHour(nowMs),
      hourLimit: this.cfg.hourLimit,
      judge:
        this.cfg.judgeCredits === null
          ? null
          : { eligible: !this.entry(refillId), judgeCredits: this.cfg.judgeCredits },
    });
    if (d.kind !== 'charge') return d;
    if (d.refill) {
      this.entries.push({
        id: refillId,
        delta: d.refill.grant,
        reason: 'judge-grant',
        balanceAfter: d.refill.balanceAfterGrant,
        atMs: nowMs,
      });
    }
    this.entries.push({
      id: spendId,
      delta: -d.cost,
      reason: 'spend',
      balanceAfter: d.balanceAfter,
      atMs: nowMs,
    });
    this.balance = d.balanceAfter;
    if (kind === 'ai') this.hourCounts.set(utcHour(nowMs), d.hourCount);
    return d;
  }

  refund(spendId: string, nowMs: number, server: boolean): RefundDecision {
    const spend = this.entry(spendId);
    const day = utcDay(nowMs);
    const d = decideRefund({
      spendId,
      spend: spend
        ? {
            delta: spend.delta,
            reason: spend.reason === 'spend' ? 'generate' : spend.reason,
            at: new Date(spend.atMs),
          }
        : null,
      refundExists: this.entry(refundIdOf(spendId)) !== undefined,
      balance: this.balance,
      nowMs,
      refundsToday: this.refundCounts.get(day) ?? 0,
      limit: this.cfg.refundsPerDay,
      maxAgeMs: MAX_REFUND_AGE_MS,
      server,
    });
    if (d.kind !== 'refund') return d;
    this.entries.push({
      id: refundIdOf(spendId),
      delta: d.amount,
      reason: 'refund',
      balanceAfter: d.balanceAfter,
      atMs: nowMs,
    });
    this.balance = d.balanceAfter;
    if (!server) this.refundCounts.set(day, (this.refundCounts.get(day) ?? 0) + 1);
    return d;
  }

  /** Invariants that must hold after every operation (C1, C4). */
  issues(): string[] {
    const out: string[] = [];
    if (this.balance < 0) out.push(`negative balance ${this.balance}`);
    let running = this.grant;
    for (const e of this.entries) {
      running += e.delta;
      if (e.balanceAfter < 0) out.push(`${e.id}: negative balanceAfter`);
      if (e.balanceAfter !== running)
        out.push(`${e.id}: balanceAfter ${e.balanceAfter} != running ${running}`);
    }
    if (running !== this.balance) out.push(`balance ${this.balance} != grant + deltas ${running}`);
    const ids = this.entries.map((e) => e.id);
    if (new Set(ids).size !== ids.length) out.push('duplicate ledger id');
    for (const e of this.entries) {
      if (e.reason !== 'refund') continue;
      const spendId = ids.find((id) => id !== e.id && safeRefundId(id) === e.id);
      const spend = spendId ? this.entry(spendId) : undefined;
      if (!spend) out.push(`${e.id}: refund without a spend`);
      else if (e.delta !== -spend.delta)
        out.push(`${e.id}: amount ${e.delta} != cost ${-spend.delta}`);
    }
    return out;
  }
}

function safeRefundId(spendId: string): string | null {
  try {
    return refundIdOf(spendId);
  } catch {
    return null;
  }
}
