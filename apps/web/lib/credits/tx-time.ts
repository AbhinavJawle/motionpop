import type { CreditTx } from '@motionpop/schemas';

/** A ledger entry's time in ms (a Firestore Timestamp or a Date). */
export const txMillis = (at: CreditTx['at']): number =>
  at instanceof Date ? at.getTime() : at.toMillis();
