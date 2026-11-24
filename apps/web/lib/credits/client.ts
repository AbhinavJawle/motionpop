import type { ClientCreditAction } from '@motionpop/schemas';

/**
 * The credits seam of the cloud AI paths (spec 09 design, "Credits seam"; spec 13 task 8).
 * `ServerCredits` talks to `/api/credits/*`; `LocalCredits` is the in-memory twin for local mode,
 * the fake router and unit tests. One contract test runs against both.
 */
export type SpendRefusal =
  'insufficient' | 'rate-limit' | 'paused' | 'key-used' | 'offline' | 'unavailable';

export type SpendResult =
  | { ok: true; txId: string; balance: number; cost: number }
  | { ok: false; reason: SpendRefusal; balance?: number };

export interface SpendRequestInput {
  action: ClientCreditAction;
  units?: number;
  /** A NEW random key per attempt (see `newSpendKey`). */
  key: string;
  refId?: string;
}

export interface CreditsClient {
  /** True when user-supplied Gemini BYOK is active (cloud Gemini actions cost 0 Motionpop credits). */
  readonly isByok?: boolean;
  /** The balance, or null while it is not known yet. */
  balance(): number | null;
  subscribe(fn: (balance: number | null) => void): () => void;
  spend(req: SpendRequestInput): Promise<SpendResult>;
  /** Gives the credits of a spend back. Never throws; a failure raises the "couldn't return" toast. */
  refund(txId: string): Promise<void>;
}

/** 32 hex characters: matches the server's key format (`[A-Za-z0-9_-]{8,64}`). */
export function newSpendKey(): string {
  return crypto.randomUUID().replaceAll('-', '');
}
