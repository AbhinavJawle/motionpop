// The Firestore render store (spec 08 design §6 and §7): the export transaction, the failure and
// refund transaction, the stalled-render sweep and the store the job writes through. Money moves
// only through the shared ledger helper (`ledger.ts`, spec 13): this file adds the render-doc
// reads and writes around it. The decisions are pure (`logic.ts`); the memory store applies the
// same ones.
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import {
  ACTIVE_RENDER_STATUSES,
  RenderDocSchema,
  nextProgress,
  type AppConfig,
  type RenderDoc,
  type RenderErrorCode,
} from '@motionpop/schemas';
import type { JobStage, RenderOutput, RenderStore, StoreWrite } from '../ports';
import {
  LedgerError,
  decideRefundFrom,
  exportSpec,
  readLedger,
  writeRefund,
  writeSpend,
  type LedgerReads,
  type SpendSpec,
} from './ledger';
import {
  canFinish,
  canHeartbeat,
  canStart,
  decideExport,
  decideFail,
  decideProgress,
  isStalled,
  type ExportRejection,
} from './logic';

export type ExportConfig = Pick<
  AppConfig,
  'exportsEnabled' | 'killSwitch' | 'rendersPerUserPerDay' | 'judgeCredits'
>;

/** The fixed fields of a new render doc; the store adds status, progress, cost and timestamps. */
export type NewRender = Pick<
  RenderDoc,
  | 'ownerId'
  | 'projectId'
  | 'requestId'
  | 'title'
  | 'format'
  | 'resolution'
  | 'captions'
  | 'music'
  | 'durationMs'
  | 'slotCount'
  | 'mode'
  | 'inputPath'
  | 'voicePath'
>;

export type StartExportResult =
  /** The same request ran before: nothing was written, no second snapshot, no second launch. */
  | { kind: 'existing'; renderId: string; doc: RenderDoc }
  | { kind: 'created'; renderId: string; costCredits: number; balanceAfter: number }
  | { kind: 'reject'; reason: ExportRejection; balance: number; renderId?: string };

const rendersRef = (db: Firestore, renderId: string) => db.doc(`renders/${renderId}`);

/**
 * In one transaction: reads (the render, the caller's active renders, the ledger docs), then the
 * decision, then the writes: the balance, the ledger entry `export-{renderId}` (and the judge
 * top-up entry when there is one), the day's `renders` count and the `queued` render doc.
 * Concurrent different requests serialise on the user doc, so two can't both pass the balance
 * or the active-render check. A repeated request id maps to the same render id and writes nothing.
 * Throws `LedgerError('not-bootstrapped')` without a user doc.
 */
export function startExport(
  db: Firestore,
  renderId: string,
  render: NewRender,
  cost: number,
  cfg: ExportConfig,
  nowMs: number,
): Promise<StartExportResult> {
  const uid = render.ownerId;
  const spec: SpendSpec = { ...exportSpec(uid, renderId), reason: 'export', refId: renderId, cost };
  return db.runTransaction(async (t) => {
    const renderRef = rendersRef(db, renderId);
    const activeQuery = db
      .collection('renders')
      .where('ownerId', '==', uid)
      .where('status', 'in', [...ACTIVE_RENDER_STATUSES])
      .limit(1);
    // All reads first (a Firestore transaction rule).
    const [reads, existing, active] = await Promise.all([
      readLedger(t, db, spec, nowMs),
      t.get(renderRef),
      t.get(activeQuery),
    ]);
    const d = decideExport({
      existing: existing.exists,
      disabled: !cfg.exportsEnabled || cfg.killSwitch,
      active: active.docs[0] ? { id: active.docs[0].id } : null,
      rendersToday: reads.limits?.renders ?? 0,
      dailyLimit: cfg.rendersPerUserPerDay,
      cost,
      balance: reads.user.credits,
      judge:
        reads.user.plan === 'judge'
          ? { eligible: !reads.refillExists, judgeCredits: cfg.judgeCredits }
          : null,
    });
    if (d.kind === 'existing') {
      return { kind: 'existing', renderId, doc: RenderDocSchema.parse(existing.data()) };
    }
    if (d.kind === 'reject') {
      return {
        kind: 'reject',
        reason: d.reason,
        balance: d.balance,
        ...(d.renderId === undefined ? {} : { renderId: d.renderId }),
      };
    }
    const at = FieldValue.serverTimestamp();
    if (d.cost > 0) {
      writeSpend(
        t,
        spec,
        {
          kind: 'charge',
          cost: d.cost,
          balanceAfter: d.balanceAfter,
          hourCount: 0,
          ...(d.refill ? { refill: d.refill } : {}),
        },
        reads,
      );
    }
    // `merge` keeps the other writers' counters in the day doc (`planCloud`, `aiByHour`, …).
    t.set(
      reads.refs.limits,
      { schemaVersion: 1, renders: d.rendersToday, updatedAt: at },
      { merge: true },
    );
    t.create(renderRef, {
      schemaVersion: 1,
      ...render,
      status: 'queued',
      progress: 0,
      costCredits: d.cost,
      createdAt: at,
    });
    return { kind: 'created', renderId, costCredits: d.cost, balanceAfter: d.balanceAfter };
  });
}

export interface FailOptions {
  nowMs?: number;
  /** Evaluated on the doc read inside the transaction; false leaves the render alone. */
  onlyIf?: (r: RenderDoc) => boolean;
}

export type FailResult =
  { kind: 'noop'; reason: 'missing' | 'final' | 'guard' } | { kind: 'failed'; refunded: number };

/**
 * Any active status → `error`, and the cost comes back once (the ledger entry
 * `refund-{renderId}` has a fixed id, so the job, the sweep and the route can all try). A final
 * render is left alone. The daily render count is not given back (design §7.2).
 */
export function failRender(
  db: Firestore,
  renderId: string,
  code: RenderErrorCode,
  message: string,
  opts: FailOptions = {},
): Promise<FailResult> {
  const nowMs = opts.nowMs ?? Date.now();
  return db.runTransaction(async (t) => {
    const renderRef = rendersRef(db, renderId);
    const snap = await t.get(renderRef);
    if (!snap.exists) return { kind: 'noop', reason: 'missing' };
    const r = RenderDocSchema.parse(snap.data());
    if (opts.onlyIf && !opts.onlyIf(r)) return { kind: 'noop', reason: 'guard' };
    const spec = exportSpec(r.ownerId, renderId);
    let reads: LedgerReads | null = null;
    try {
      reads = await readLedger(t, db, spec, nowMs);
    } catch (e) {
      // An account that no longer exists has nobody to refund; the render still fails.
      if (!(e instanceof LedgerError)) throw e;
    }
    const f = decideFail(r, reads?.refunded ?? false);
    if (f.kind === 'noop') return { kind: 'noop', reason: 'final' };
    t.update(renderRef, {
      status: 'error',
      error: code,
      errorMessage: message.slice(0, 200),
      finishedAt: FieldValue.serverTimestamp(),
    });
    let refunded = 0;
    if (f.refund > 0 && reads) {
      const d = decideRefundFrom(spec, reads, { refundsPerDay: 0 }, nowMs, true);
      writeRefund(t, { ...spec, refundRefId: renderId }, d, reads, { server: true });
      if (d.kind === 'refund') refunded = d.amount;
    }
    return { kind: 'failed', refunded };
  });
}

/**
 * Fails a stalled render as `stalled` (R4.6) and returns the doc as it is afterwards, or null
 * when it does not exist. The stall test runs on the doc read inside the transaction, so a render
 * whose heartbeat arrived a moment ago is left alone. The server clock decides.
 */
export async function sweepIfStalled(
  db: Firestore,
  renderId: string,
  nowMs: number,
): Promise<RenderDoc | null> {
  await failRender(db, renderId, 'stalled', 'The render stopped responding.', {
    nowMs,
    onlyIf: (r) => isStalled(r, nowMs),
  });
  const snap = await rendersRef(db, renderId).get();
  return snap.exists ? RenderDocSchema.parse(snap.data()) : null;
}

/** Stores the execution name after the job was launched. A plain write: the field is optional. */
export async function recordExecution(
  db: Firestore,
  renderId: string,
  executionName: string,
): Promise<void> {
  await rendersRef(db, renderId).update({ executionName });
}

/** The store the job writes through. Every method is one transaction that re-reads the doc. */
export class FirestoreRenderStore implements RenderStore {
  constructor(private readonly db: Firestore) {}

  async get(renderId: string): Promise<RenderDoc | null> {
    const snap = await rendersRef(this.db, renderId).get();
    return snap.exists ? RenderDocSchema.parse(snap.data()) : null;
  }

  markStarted(renderId: string): Promise<boolean> {
    const ref = rendersRef(this.db, renderId);
    return this.db.runTransaction(async (t) => {
      const snap = await t.get(ref);
      if (!snap.exists) return false;
      const r = RenderDocSchema.parse(snap.data());
      if (!canStart(r)) return false;
      const at = FieldValue.serverTimestamp();
      t.update(ref, {
        status: 'rendering',
        progress: nextProgress(r.progress, 1),
        startedAt: at,
        heartbeatAt: at,
      });
      return true;
    });
  }

  progress(renderId: string, stage: JobStage, progress: number): Promise<StoreWrite> {
    const ref = rendersRef(this.db, renderId);
    return this.db.runTransaction(async (t) => {
      const snap = await t.get(ref);
      if (!snap.exists) return 'inactive';
      const d = decideProgress(RenderDocSchema.parse(snap.data()), stage, progress);
      if (d.kind === 'inactive') return 'inactive';
      t.update(ref, {
        status: d.status,
        progress: d.progress,
        heartbeatAt: FieldValue.serverTimestamp(),
      });
      return 'ok';
    });
  }

  heartbeat(renderId: string): Promise<StoreWrite> {
    const ref = rendersRef(this.db, renderId);
    return this.db.runTransaction(async (t) => {
      const snap = await t.get(ref);
      if (!snap.exists || !canHeartbeat(RenderDocSchema.parse(snap.data()))) return 'inactive';
      t.update(ref, { heartbeatAt: FieldValue.serverTimestamp() });
      return 'ok';
    });
  }

  markDone(renderId: string, output: RenderOutput): Promise<StoreWrite> {
    const ref = rendersRef(this.db, renderId);
    return this.db.runTransaction(async (t) => {
      const snap = await t.get(ref);
      if (!snap.exists || !canFinish(RenderDocSchema.parse(snap.data()))) return 'inactive';
      t.update(ref, {
        status: 'done',
        progress: 100,
        outputPath: output.outputPath,
        thumbPath: output.thumbPath,
        sizeBytes: output.sizeBytes,
        finishedAt: FieldValue.serverTimestamp(),
      });
      return 'ok';
    });
  }

  async fail(renderId: string, code: RenderErrorCode, message: string): Promise<void> {
    await failRender(this.db, renderId, code, message);
  }
}
