// The one credit ledger helper (spec 13 design, "Ledger"; spec 08 design §7). Every credited action
// reads, decides and writes through these pieces: the AI spend and refund routes through
// `spendCredits` / `refundCredits`, and spec 08's `startExport`, `failRender` and the stalled-render
// sweep by calling `readLedger`, `writeSpend` and `writeRefund` inside their own transactions,
// next to the render-doc reads and writes. The decisions are pure (`ledger-logic.ts`).
import { FieldValue, type Firestore, type Transaction } from 'firebase-admin/firestore';
import {
  CreditTxSchema,
  DailyLimitsSchema,
  UserDocSchema,
  type AppConfig,
  type CreditReason,
  type CreditTx,
  type DailyLimits,
  type RefundResponse,
  type SpendResponse,
  type UserDoc,
} from '@motionpop/schemas';
import {
  MAX_REFUND_AGE_MS,
  decideRefund,
  decideSpend,
  refundIdOf,
  type RefundDecision,
  type SpendDecision,
  type SpendKind,
} from './ledger-logic';

export type LedgerConfig = Pick<
  AppConfig,
  'killSwitch' | 'rateLimitCloudPerHour' | 'refundsPerDay' | 'judgeCredits'
>;

/** Thrown when the user doc does not exist yet: the client re-runs bootstrap and retries once. */
export class LedgerError extends Error {
  constructor(
    readonly code: 'not-bootstrapped',
    message: string,
  ) {
    super(message);
    this.name = 'LedgerError';
  }
}

/** Which entries one spend touches. `kind` picks the id scheme: `s-`/`r-` or `export-`/`refund-`. */
export interface LedgerSpec {
  uid: string;
  kind: SpendKind;
  spendId: string;
  refundId: string;
}

export interface SpendSpec extends LedgerSpec {
  reason: CreditReason;
  /** What the entry points at (slot id, project id, render id). Omitted when not given. */
  refId?: string;
  cost: number;
}

export interface RefundSpec extends LedgerSpec {
  /** The `refId` of the refund entry: the spend id for AI spends, the render id for exports. */
  refundRefId: string;
}

/** The ids of an AI spend and its refund for an idempotency key. */
export function aiSpec(uid: string, key: string): LedgerSpec {
  const spendId = `s-${key}`;
  return { uid, kind: 'ai', spendId, refundId: refundIdOf(spendId) };
}

/** The ids of an export for a render id (spec 08). */
export function exportSpec(uid: string, renderId: string): LedgerSpec {
  const spendId = `export-${renderId}`;
  return { uid, kind: 'export', spendId, refundId: refundIdOf(spendId) };
}

export interface LedgerReads {
  day: string;
  /** `00`..`23`, the key of `limits.aiByHour`. */
  hour: string;
  user: UserDoc;
  spend: CreditTx | null;
  refunded: boolean;
  limits: DailyLimits | null;
  refillExists: boolean;
  refs: {
    user: FirebaseFirestore.DocumentReference;
    spend: FirebaseFirestore.DocumentReference;
    refund: FirebaseFirestore.DocumentReference;
    limits: FirebaseFirestore.DocumentReference;
    refill: FirebaseFirestore.DocumentReference;
  };
}

export const utcDayOf = (nowMs: number): string => new Date(nowMs).toISOString().slice(0, 10);
const utcHourOf = (nowMs: number): string => new Date(nowMs).toISOString().slice(11, 13);

/**
 * All reads one spend or refund needs, as one `getAll`. Call it inside a transaction before any
 * write (a Firestore rule). Throws `LedgerError('not-bootstrapped')` without a user doc.
 */
export async function readLedger(
  t: Transaction,
  db: Firestore,
  s: LedgerSpec,
  nowMs: number,
): Promise<LedgerReads> {
  const day = utcDayOf(nowMs);
  const userRef = db.doc(`users/${s.uid}`);
  const credits = db.collection(`users/${s.uid}/credits`);
  const refs = {
    user: userRef,
    spend: credits.doc(s.spendId),
    refund: credits.doc(s.refundId),
    limits: db.doc(`users/${s.uid}/limits/${day}`),
    refill: credits.doc(`judge-refill-${day}`),
  };
  const [user, spend, refund, limits, refill] = await t.getAll(
    refs.user,
    refs.spend,
    refs.refund,
    refs.limits,
    refs.refill,
  );
  if (!user?.exists) throw new LedgerError('not-bootstrapped', 'User doc does not exist');
  return {
    day,
    hour: utcHourOf(nowMs),
    user: UserDocSchema.parse(user.data()),
    spend: spend?.exists ? CreditTxSchema.parse(spend.data()) : null,
    refunded: refund?.exists ?? false,
    limits: limits?.exists ? DailyLimitsSchema.parse(limits.data()) : null,
    refillExists: refill?.exists ?? false,
    refs,
  };
}

/** The decision for a spend, from the reads. Pure apart from `readLedger`'s result. */
export function decideSpendFrom(s: SpendSpec, r: LedgerReads, cfg: LedgerConfig): SpendDecision {
  return decideSpend({
    kind: s.kind,
    balance: r.user.credits,
    cost: s.cost,
    existing: r.spend ? { delta: r.spend.delta, balanceAfter: r.spend.balanceAfter } : null,
    refunded: r.refunded,
    killSwitch: cfg.killSwitch,
    hourCount: r.limits?.aiByHour[r.hour] ?? 0,
    hourLimit: cfg.rateLimitCloudPerHour,
    judge:
      r.user.plan === 'judge'
        ? { eligible: !r.refillExists, judgeCredits: cfg.judgeCredits }
        : null,
  });
}

/**
 * Applies a decision. Writes nothing for a replay or a refusal. A charge updates the balance,
 * writes the judge top-up entry (when there is one) and the spend entry with `create` (so a fixed
 * id can never be written twice), and for AI spends merges the hour's count into the day doc.
 * Exports keep their own `renders` counter (spec 08) and leave the day doc to `startExport`.
 * No reads here.
 */
export function writeSpend(t: Transaction, s: SpendSpec, d: SpendDecision, r: LedgerReads): void {
  if (d.kind !== 'charge') return;
  const at = FieldValue.serverTimestamp();
  if (d.refill) {
    t.create(r.refs.refill, {
      delta: d.refill.grant,
      reason: 'judge-grant',
      refId: `refill-${r.day}`,
      balanceAfter: d.refill.balanceAfterGrant,
      at,
    });
  }
  t.update(r.refs.user, { credits: d.balanceAfter });
  t.create(r.refs.spend, {
    delta: -d.cost,
    reason: s.reason,
    ...(s.refId === undefined ? {} : { refId: s.refId }),
    balanceAfter: d.balanceAfter,
    at,
  });
  if (s.kind === 'ai') {
    t.set(
      r.refs.limits,
      { schemaVersion: 1, aiByHour: { [r.hour]: d.hourCount }, updatedAt: at },
      { merge: true },
    );
  }
}

/** The decision for a refund, from the reads. `server` is true for render failures and sweeps. */
export function decideRefundFrom(
  s: LedgerSpec,
  r: LedgerReads,
  cfg: Pick<LedgerConfig, 'refundsPerDay'>,
  nowMs: number,
  server: boolean,
): RefundDecision {
  return decideRefund({
    spendId: s.spendId,
    spend: r.spend,
    refundExists: r.refunded,
    balance: r.user.credits,
    nowMs,
    refundsToday: r.limits?.refunds ?? 0,
    limit: cfg.refundsPerDay,
    maxAgeMs: MAX_REFUND_AGE_MS,
    server,
  });
}

/** Applies a refund decision: the balance, the refund entry (`create`, fixed id) and, for a client refund, the day's count. */
export function writeRefund(
  t: Transaction,
  s: RefundSpec,
  d: RefundDecision,
  r: LedgerReads,
  opts: { server: boolean },
): void {
  if (d.kind !== 'refund') return;
  const at = FieldValue.serverTimestamp();
  t.update(r.refs.user, { credits: d.balanceAfter });
  t.create(r.refs.refund, {
    delta: d.amount,
    reason: 'refund',
    refId: s.refundRefId,
    balanceAfter: d.balanceAfter,
    at,
  });
  if (!opts.server) {
    t.set(
      r.refs.limits,
      {
        schemaVersion: 1,
        refunds: (r.limits?.refunds ?? 0) + 1,
        updatedAt: at,
      },
      { merge: true },
    );
  }
}

/** The response of `POST /api/credits/spend` for a decision. */
export function spendResponse(s: SpendSpec, d: SpendDecision): SpendResponse {
  if (d.kind === 'refuse') return { ok: false, reason: d.reason, balance: d.balance };
  if (d.kind === 'replay') return { ok: true, txId: s.spendId, balance: d.balance, cost: d.cost };
  return { ok: true, txId: s.spendId, balance: d.balanceAfter, cost: d.cost };
}

/**
 * One AI spend in one transaction. Concurrent spends serialise on the user doc (Firestore retries
 * on contention), so at most `floor(balance / cost)` succeed.
 */
export function spendCredits(
  db: Firestore,
  s: SpendSpec,
  cfg: LedgerConfig,
  nowMs: number,
): Promise<SpendResponse> {
  return db.runTransaction(async (t) => {
    const reads = await readLedger(t, db, s, nowMs);
    const d = decideSpendFrom(s, reads, cfg);
    writeSpend(t, s, d, reads);
    return spendResponse(s, d);
  });
}

/** One client refund of an AI spend (`s-{key}`) in one transaction. */
export function refundCredits(
  db: Firestore,
  uid: string,
  txId: string,
  cfg: Pick<LedgerConfig, 'refundsPerDay'>,
  nowMs: number,
): Promise<RefundResponse> {
  const spec: RefundSpec = {
    uid,
    kind: 'ai',
    spendId: txId,
    refundId: refundIdOf(txId),
    refundRefId: txId,
  };
  return db.runTransaction(async (t) => {
    const reads = await readLedger(t, db, spec, nowMs);
    const d = decideRefundFrom(spec, reads, cfg, nowMs, false);
    writeRefund(t, spec, d, reads, { server: false });
    if (d.kind === 'refuse') return { ok: false, reason: d.reason };
    if (d.kind === 'replay') return { ok: true, balance: d.balance, alreadyRefunded: true };
    return { ok: true, balance: d.balanceAfter, alreadyRefunded: false };
  });
}
