// Pure decisions of the render store (spec 08 design §7). The Firestore store and the memory
// store apply them inside their own transactions. Task 8 adds `decideExport` and `isStalled`.
import { isFinalStatus, type RenderDoc } from '@motionpop/schemas';

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
