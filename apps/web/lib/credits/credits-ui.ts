import type { ClientCreditAction } from '@motionpop/schemas';
import { toast } from 'sonner';
import { create } from 'zustand';
import type { SpendResult } from './client';

/**
 * UI reactions of the credits flow (spec 13 R1.8, R3.1, R3.2, R5.3). Plain functions and a tiny
 * store, so the non-React `ServerCredits` and the generate flows can raise them.
 */
export const REFUND_FAILED_COPY = "Couldn't return your credits. Tell us and we'll fix it.";
export const RATE_LIMIT_COPY = 'Pip needs a short break. Try again in a few minutes.';
export const PAUSED_COPY = 'Cloud AI is paused';
export const OFFLINE_SPEND_COPY = "Couldn't reach Motionpop. Check your connection.";
export const NEEDS_CONNECTION_COPY = 'Needs connection';

export interface OutOfCreditsInfo {
  action: ClientCreditAction;
  /** What the attempted action costs. */
  cost: number;
  /** The balance at the time, or null when unknown. */
  balance: number | null;
}

interface CreditsUiState {
  outOfCredits: OutOfCreditsInfo | null;
}

export const useCreditsUi = create<CreditsUiState>(() => ({ outOfCredits: null }));

export function openOutOfCredits(info: OutOfCreditsInfo): void {
  useCreditsUi.setState({ outOfCredits: info });
}
export function closeOutOfCredits(): void {
  useCreditsUi.setState({ outOfCredits: null });
}

/**
 * The pre-check before a credited action (R5.3): when the known balance is below the cost, open
 * the modal and return true (the caller stops, nothing is charged). An unknown balance is not a
 * refusal: the server answers `insufficient` if it comes to that.
 */
export function blockIfInsufficient(i: OutOfCreditsInfo): boolean {
  if (i.balance !== null && i.balance < i.cost) {
    openOutOfCredits(i);
    return true;
  }
  return false;
}

export function refundFailed(txId: string): void {
  // The id is logged so the founder can find the entry; the toast stays friendly.
  console.warn('Refund failed for', txId);
  toast.error(REFUND_FAILED_COPY);
}
export function rateLimited(): void {
  toast(RATE_LIMIT_COPY);
}
export function paused(): void {
  toast(PAUSED_COPY);
}
export function cantReach(): void {
  toast.error(OFFLINE_SPEND_COPY);
}

/**
 * What a refused spend shows (task 9): `insufficient` opens the modal, the others a toast.
 * Returns true when the spend was refused (the caller must not run the AI call).
 */
export function reportRefusal(
  result: SpendResult,
  ctx: { action: ClientCreditAction; cost: number },
): boolean {
  if (result.ok) return false;
  switch (result.reason) {
    case 'insufficient':
      openOutOfCredits({ ...ctx, balance: result.balance ?? null });
      break;
    case 'rate-limit':
      rateLimited();
      break;
    case 'paused':
      paused();
      break;
    case 'offline':
      toast(NEEDS_CONNECTION_COPY);
      break;
    case 'key-used':
    case 'unavailable':
      cantReach();
      break;
  }
  return true;
}
