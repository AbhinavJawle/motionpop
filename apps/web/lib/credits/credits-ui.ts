import { toast } from 'sonner';

/**
 * Small UI reactions of the credits flow (spec 13 R1.8, R3.1, R3.2). Plain functions so the
 * non-React `ServerCredits` can raise them. The out-of-credits modal state joins them in task 9.
 */
export const REFUND_FAILED_COPY = "Couldn't return your credits. Tell us and we'll fix it.";
export const RATE_LIMIT_COPY = 'Pip needs a short break. Try again in a few minutes.';
export const PAUSED_COPY = 'Cloud AI is paused';
export const OFFLINE_SPEND_COPY = "Couldn't reach Motionpop. Check your connection.";

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
