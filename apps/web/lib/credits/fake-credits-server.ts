import { decideRefund, decideSpend, MAX_REFUND_AGE_MS, refundIdOf } from '@motionpop/render/store';
import {
  APP_CONFIG_DEFAULTS,
  RefundRequestSchema,
  SpendRequestSchema,
  costOf,
  spendTxId,
  type RefundResponse,
  type SpendResponse,
} from '@motionpop/schemas';

/**
 * An in-memory `/api/credits/*` built only from the pure ledger decisions (`decideSpend`,
 * `decideRefund`), as a `fetch`. Used by the `ServerCredits` rows of the contract test and by the
 * spec 09 P5 property. Test support, not shipped to the browser.
 */
export interface FakeCreditsServer {
  fetch: typeof fetch;
  balance(): number;
  calls: { url: string; body: unknown }[];
  /** Make the next `n` requests answer with this HTTP status. */
  failNext(n: number, status?: number): void;
  /** Make the next `n` requests throw like a network error. */
  dropNext(n: number): void;
  setKillSwitch(on: boolean): void;
  advance(ms: number): void;
}

export function createFakeCreditsServer(
  start: number,
  opts: { hourLimit?: number } = {},
): FakeCreditsServer {
  let balance = start;
  let now = Date.UTC(2026, 10, 20, 12, 0, 0);
  let kill = false;
  let fail = { n: 0, status: 500 };
  let drop = 0;
  let refundsToday = 0;
  let hourCount = 0;
  const spends = new Map<string, { delta: number; balanceAfter: number; atMs: number }>();
  const refunds = new Set<string>();
  const calls: FakeCreditsServer['calls'] = [];
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  const fakeFetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const body: unknown = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ url, body });
    if (drop > 0) {
      drop--;
      return Promise.reject(new TypeError('Failed to fetch'));
    }
    if (fail.n > 0) {
      fail.n--;
      return Promise.resolve(json(fail.status, { error: 'boom' }));
    }
    if (url.endsWith('/api/credits/spend')) {
      const parsed = SpendRequestSchema.safeParse(body);
      if (!parsed.success) return Promise.resolve(json(400, { error: 'Invalid request' }));
      const r = parsed.data;
      const id = spendTxId(r.key);
      const existing = spends.get(id);
      const d = decideSpend({
        kind: 'ai',
        balance,
        cost: costOf(r.action, r.units, APP_CONFIG_DEFAULTS),
        existing: existing ? { delta: existing.delta, balanceAfter: existing.balanceAfter } : null,
        refunded: refunds.has(refundIdOf(id)),
        killSwitch: kill,
        hourCount,
        hourLimit: opts.hourLimit ?? 30,
        judge: null,
      });
      let res: SpendResponse;
      if (d.kind === 'refuse') res = { ok: false, reason: d.reason, balance: d.balance };
      else if (d.kind === 'replay') res = { ok: true, txId: id, balance: d.balance, cost: d.cost };
      else {
        balance = d.balanceAfter;
        hourCount = d.hourCount;
        spends.set(id, { delta: -d.cost, balanceAfter: d.balanceAfter, atMs: now });
        res = { ok: true, txId: id, balance: d.balanceAfter, cost: d.cost };
      }
      return Promise.resolve(json(200, res));
    }
    if (url.endsWith('/api/credits/refund')) {
      const parsed = RefundRequestSchema.safeParse(body);
      if (!parsed.success) return Promise.resolve(json(400, { error: 'Invalid request' }));
      const id = parsed.data.txId;
      const spend = spends.get(id);
      const rid = refundIdOf(id);
      const d = decideRefund({
        spendId: id,
        spend: spend ? { delta: spend.delta, reason: 'generate', at: new Date(spend.atMs) } : null,
        refundExists: refunds.has(rid),
        balance,
        nowMs: now,
        refundsToday,
        limit: 30,
        maxAgeMs: MAX_REFUND_AGE_MS,
        server: false,
      });
      let res: RefundResponse;
      if (d.kind === 'refuse') res = { ok: false, reason: d.reason };
      else if (d.kind === 'replay') res = { ok: true, balance: d.balance, alreadyRefunded: true };
      else {
        balance = d.balanceAfter;
        refunds.add(rid);
        refundsToday++;
        res = { ok: true, balance: d.balanceAfter, alreadyRefunded: false };
      }
      return Promise.resolve(json(200, res));
    }
    return Promise.resolve(json(404, { error: 'Not found' }));
  };

  return {
    fetch: fakeFetch as typeof fetch,
    balance: () => balance,
    calls,
    failNext: (n, status = 500) => {
      fail = { n, status };
    },
    dropNext: (n) => {
      drop = n;
    },
    setKillSwitch: (on) => {
      kill = on;
    },
    advance: (ms) => {
      now += ms;
    },
  };
}
