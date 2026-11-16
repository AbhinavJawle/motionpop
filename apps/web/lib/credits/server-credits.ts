import { RefundResponseSchema, SpendResponseSchema } from '@motionpop/schemas';
import {
  newSpendKey,
  type CreditsClient,
  type SpendRequestInput,
  type SpendResult,
} from './client';
import { refundFailed } from './credits-ui';

/** What `ServerCredits` needs from its surroundings; tests pass fakes for all of it. */
export interface ServerCreditsDeps {
  fetch: typeof fetch;
  /** ID token (and App Check token) headers for our API routes. */
  headers: () => Promise<HeadersInit>;
  /** Runs account setup again; used once after a 409 "Not bootstrapped". */
  rebootstrap: () => Promise<void>;
  readBalance: () => number | null;
  subscribeBalance: (fn: () => void) => () => void;
  /** Shows a spend's answer until the Firestore snapshot catches up. */
  setBalance: (balance: number) => void;
  isOnline: () => boolean;
  newKey?: () => string;
  wait?: (ms: number) => Promise<void>;
  onRefundFailed?: (txId: string) => void;
}

const REFUND_RETRY_MS = 2000;

/**
 * `CreditsClient` over `POST /api/credits/spend` and `/refund` (spec 13 task 8). Refusals are 200
 * answers with `ok: false`; anything else (network, 4xx/5xx) is `offline` or `unavailable` and
 * never lets the AI call run.
 */
export class ServerCredits implements CreditsClient {
  private readonly newKey: () => string;
  private readonly wait: (ms: number) => Promise<void>;
  private readonly answered = new Set<string>();

  constructor(private readonly deps: ServerCreditsDeps) {
    this.newKey = deps.newKey ?? newSpendKey;
    this.wait = deps.wait ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  balance(): number | null {
    return this.deps.readBalance();
  }

  subscribe(fn: (balance: number | null) => void): () => void {
    return this.deps.subscribeBalance(() => fn(this.deps.readBalance()));
  }

  async spend(req: SpendRequestInput): Promise<SpendResult> {
    const first = await this.post(req);
    // The spend happens before any AI call, so a second try on a fresh key can't double-charge.
    if (!first.ok && first.reason === 'key-used') {
      const second = await this.post({ ...req, key: this.newKey() });
      return second.ok || second.reason !== 'key-used'
        ? second
        : {
            ok: false,
            reason: 'unavailable',
            ...(second.balance === undefined ? {} : { balance: second.balance }),
          };
    }
    return first;
  }

  private async post(req: SpendRequestInput, rebootstrapped = false): Promise<SpendResult> {
    let res: Response;
    try {
      res = await this.deps.fetch('/api/credits/spend', {
        method: 'POST',
        headers: { ...(await this.deps.headers()), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: req.action,
          units: req.units ?? 1,
          key: req.key,
          ...(req.refId === undefined ? {} : { refId: req.refId }),
        }),
      });
    } catch {
      return { ok: false, reason: this.deps.isOnline() ? 'unavailable' : 'offline' };
    }
    if (res.status === 409 && !rebootstrapped) {
      try {
        await this.deps.rebootstrap();
      } catch {
        return { ok: false, reason: 'unavailable' };
      }
      return this.post(req, true);
    }
    if (!res.ok) return { ok: false, reason: 'unavailable' };
    const parsed = SpendResponseSchema.safeParse(await res.json().catch(() => null));
    if (!parsed.success) return { ok: false, reason: 'unavailable' };
    const body = parsed.data;
    // A replay of a key this client already got an answer for carries the FIRST answer's balance,
    // which may be stale: only the first answer per spend id is shown optimistically (the
    // Firestore snapshot corrects everything else).
    if (!body.ok) this.deps.setBalance(body.balance);
    else if (!this.answered.has(body.txId)) {
      this.answered.add(body.txId);
      this.deps.setBalance(body.balance);
    }
    return body.ok
      ? { ok: true, txId: body.txId, balance: body.balance, cost: body.cost }
      : { ok: false, reason: body.reason, balance: body.balance };
  }

  async refund(txId: string): Promise<void> {
    const failed = this.deps.onRefundFailed ?? refundFailed;
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) await this.wait(REFUND_RETRY_MS);
      try {
        const res = await this.deps.fetch('/api/credits/refund', {
          method: 'POST',
          headers: { ...(await this.deps.headers()), 'Content-Type': 'application/json' },
          body: JSON.stringify({ txId }),
        });
        if (res.ok) {
          const parsed = RefundResponseSchema.safeParse(await res.json().catch(() => null));
          if (parsed.success && parsed.data.ok) {
            this.deps.setBalance(parsed.data.balance);
            return;
          }
          // A refusal (too old, over the daily cap, not found) is final: no retry.
          if (parsed.success) break;
        }
        // 4xx other than a refusal is final too; only network errors and 5xx are retried.
        if (res.status < 500) break;
      } catch {
        // Network error: retry once.
      }
    }
    failed(txId);
  }
}
