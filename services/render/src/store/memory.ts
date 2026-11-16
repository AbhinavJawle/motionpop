// In-memory render store: offline mode and tests. It applies the same rules as the Firestore
// store (transition table, progress that never goes down, one refund per render).
import {
  canTransition,
  isActiveStatus,
  nextProgress,
  type RenderDoc,
  type RenderErrorCode,
} from '@motionpop/schemas';
import type { JobStage, RenderOutput, RenderStore, StoreWrite } from '../ports';
import { decideFail } from './logic';

export interface MemoryLedgerEntry {
  id: string;
  uid: string;
  delta: number;
  reason: 'refund';
  refId: string;
  balanceAfter: number;
}

export class MemoryRenderStore implements RenderStore {
  readonly docs = new Map<string, RenderDoc>();
  /** Credits by user; only touched by refunds here (the export transaction is task 8). */
  readonly balances = new Map<string, number>();
  readonly ledger: MemoryLedgerEntry[] = [];

  constructor(private readonly now: () => Date = () => new Date()) {}

  /** Seeds a render (tests, and the offline route that creates it). */
  create(renderId: string, doc: RenderDoc): void {
    this.docs.set(renderId, doc);
  }

  refundsOf(renderId: string): MemoryLedgerEntry[] {
    return this.ledger.filter((e) => e.refId === renderId);
  }

  async get(renderId: string): Promise<RenderDoc | null> {
    const d = this.docs.get(renderId);
    return d ? { ...d } : null;
  }

  async markStarted(renderId: string): Promise<boolean> {
    const d = this.docs.get(renderId);
    if (!d || !canTransition(d.status, 'rendering')) return false;
    const at = this.now();
    this.docs.set(renderId, {
      ...d,
      status: 'rendering',
      progress: nextProgress(d.progress, 1),
      startedAt: at,
      heartbeatAt: at,
    });
    return true;
  }

  async progress(renderId: string, stage: JobStage, progress: number): Promise<StoreWrite> {
    const d = this.docs.get(renderId);
    if (!d || (d.status !== 'rendering' && d.status !== 'encoding')) return 'inactive';
    // A stage never goes back: `encoding` stays `encoding`, `rendering` may move to `encoding`.
    const status = d.status === 'rendering' && stage === 'encoding' ? 'encoding' : d.status;
    this.docs.set(renderId, {
      ...d,
      status,
      // 100 is reserved for `done`.
      progress: Math.min(99, nextProgress(d.progress, progress)),
      heartbeatAt: this.now(),
    });
    return 'ok';
  }

  async heartbeat(renderId: string): Promise<StoreWrite> {
    const d = this.docs.get(renderId);
    if (!d || !isActiveStatus(d.status)) return 'inactive';
    this.docs.set(renderId, { ...d, heartbeatAt: this.now() });
    return 'ok';
  }

  async markDone(renderId: string, output: RenderOutput): Promise<StoreWrite> {
    const d = this.docs.get(renderId);
    if (!d || !canTransition(d.status, 'done')) return 'inactive';
    this.docs.set(renderId, {
      ...d,
      status: 'done',
      progress: 100,
      outputPath: output.outputPath,
      thumbPath: output.thumbPath,
      sizeBytes: output.sizeBytes,
      finishedAt: this.now(),
    });
    return 'ok';
  }

  async fail(renderId: string, code: RenderErrorCode, message: string): Promise<void> {
    const d = this.docs.get(renderId);
    if (!d) return;
    const refundId = `refund-${renderId}`;
    const decision = decideFail(
      d,
      this.ledger.some((e) => e.id === refundId),
    );
    if (decision.kind === 'noop') return;
    this.docs.set(renderId, {
      ...d,
      status: 'error',
      error: code,
      errorMessage: message.slice(0, 200),
      finishedAt: this.now(),
    });
    if (decision.refund > 0) {
      const balanceAfter = (this.balances.get(d.ownerId) ?? 0) + decision.refund;
      this.balances.set(d.ownerId, balanceAfter);
      this.ledger.push({
        id: refundId,
        uid: d.ownerId,
        delta: decision.refund,
        reason: 'refund',
        refId: renderId,
        balanceAfter,
      });
    }
  }
}
