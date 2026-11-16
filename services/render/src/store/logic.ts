// Pure decisions of the render store (spec 08 design §6 and §7). The Firestore store and the
// memory store apply them inside their own transactions, so the rules exist once and are
// property-tested without the emulator. The money rules are in `ledger-logic.ts`.
import {
  canTransition,
  isActiveStatus,
  isFinalStatus,
  nextProgress,
  type RenderDoc,
  type RenderStatus,
} from '@motionpop/schemas';
import { decideSpend, txMs, type SpendDecision, type SpendInput } from './ledger-logic';

// ---------------------------------------------------------------------------------------------
// Failing a render

export type FailDecision =
  | { kind: 'noop'; reason: 'final' }
  /** `refund` is the credits to give back now (0 when none is due). */
  | { kind: 'fail'; refund: number };

/**
 * A final render never changes again. An active one becomes `error`, and its cost comes back
 * unless a refund was already paid (the ledger entry `refund-{renderId}` exists).
 */
export function decideFail(render: RenderDoc, refundExists: boolean): FailDecision {
  if (isFinalStatus(render.status)) return { kind: 'noop', reason: 'final' };
  return { kind: 'fail', refund: refundExists ? 0 : render.costCredits };
}

// ---------------------------------------------------------------------------------------------
// The job's writes (shared by the Firestore and memory stores)

/** The status the job writes progress in. A stage never goes back: `encoding` stays `encoding`. */
export type JobStageName = 'rendering' | 'encoding';

/** `queued → rendering`: allowed only from `queued`. */
export const canStart = (r: Pick<RenderDoc, 'status'>): boolean =>
  canTransition(r.status, 'rendering');

export type ProgressDecision =
  { kind: 'inactive' } | { kind: 'write'; status: RenderStatus; progress: number };

/**
 * A progress write is for `rendering` and `encoding` renders only. Progress never lowers and is
 * capped at 99, because 100 belongs to `done`.
 */
export function decideProgress(
  r: Pick<RenderDoc, 'status' | 'progress'>,
  stage: JobStageName,
  candidate: number,
): ProgressDecision {
  if (r.status !== 'rendering' && r.status !== 'encoding') return { kind: 'inactive' };
  const status = r.status === 'rendering' && stage === 'encoding' ? 'encoding' : r.status;
  return { kind: 'write', status, progress: Math.min(99, nextProgress(r.progress, candidate)) };
}

/** A heartbeat counts for an active render only. */
export const canHeartbeat = (r: Pick<RenderDoc, 'status'>): boolean => isActiveStatus(r.status);

/** `encoding → done` (the transition table decides). */
export const canFinish = (r: Pick<RenderDoc, 'status'>): boolean => canTransition(r.status, 'done');

// ---------------------------------------------------------------------------------------------
// Stalled renders (R4.6)

export const QUEUED_STALL_MS = 5 * 60_000;
export const HEARTBEAT_STALL_MS = 90_000;
/** The 20-minute task timeout plus 2 minutes. */
export const ACTIVE_STALL_MS = 22 * 60_000;

/**
 * True when a render is queued for more than 5 minutes, or active with a heartbeat older than
 * 90 s (the start time stands in for a heartbeat that was never written), or active for more
 * than the task timeout plus 2 minutes. A final render is never stalled. The server clock decides.
 */
export function isStalled(
  r: Pick<RenderDoc, 'status' | 'createdAt' | 'startedAt' | 'heartbeatAt'>,
  nowMs: number,
): boolean {
  if (!isActiveStatus(r.status)) return false;
  const created = txMs(r.createdAt);
  if (nowMs - created > ACTIVE_STALL_MS) return true;
  if (r.status === 'queued') return nowMs - created > QUEUED_STALL_MS;
  const beat = r.heartbeatAt ?? r.startedAt ?? r.createdAt;
  return nowMs - txMs(beat) > HEARTBEAT_STALL_MS;
}

// ---------------------------------------------------------------------------------------------
// Starting an export

export type ExportRejection = 'disabled' | 'render-active' | 'daily-limit' | 'insufficient-credits';

export type ExportDecision =
  /** The same request ran before: answer with the existing render and write nothing. */
  | { kind: 'existing' }
  | { kind: 'reject'; reason: ExportRejection; balance: number; renderId?: string }
  | {
      kind: 'created';
      cost: number;
      balanceAfter: number;
      /** The day's render count to store. */
      rendersToday: number;
      refill?: { grant: number; balanceAfterGrant: number };
    };

export interface ExportInput {
  existing: boolean;
  /** `exportsEnabled` false, or the kill switch on. */
  disabled: boolean;
  active: { id: string } | null;
  rendersToday: number;
  dailyLimit: number;
  cost: number;
  balance: number;
  judge: SpendInput['judge'];
}

/**
 * Order: an existing render (idempotent replay), exports switched off, an active render, the
 * daily count, then the balance with the shared ledger rules (a judge is topped up first when the
 * balance is short). A cost of 0 moves no money and writes no ledger entry. Nothing is charged
 * unless every check passes.
 */
export function decideExport(i: ExportInput): ExportDecision {
  if (i.existing) return { kind: 'existing' };
  if (i.disabled) return { kind: 'reject', reason: 'disabled', balance: i.balance };
  if (i.active) {
    return { kind: 'reject', reason: 'render-active', balance: i.balance, renderId: i.active.id };
  }
  if (i.rendersToday >= i.dailyLimit) {
    return { kind: 'reject', reason: 'daily-limit', balance: i.balance };
  }
  if (i.cost === 0) {
    return {
      kind: 'created',
      cost: 0,
      balanceAfter: i.balance,
      rendersToday: i.rendersToday + 1,
    };
  }
  const spend: SpendDecision = decideSpend({
    kind: 'export',
    balance: i.balance,
    cost: i.cost,
    existing: null,
    refunded: false,
    killSwitch: false,
    hourCount: 0,
    hourLimit: 0,
    judge: i.judge,
  });
  if (spend.kind === 'refuse') {
    return { kind: 'reject', reason: 'insufficient-credits', balance: i.balance };
  }
  if (spend.kind !== 'charge') throw new Error('unreachable: a new export cannot replay');
  return {
    kind: 'created',
    cost: spend.cost,
    balanceAfter: spend.balanceAfter,
    rendersToday: i.rendersToday + 1,
    ...(spend.refill ? { refill: spend.refill } : {}),
  };
}
