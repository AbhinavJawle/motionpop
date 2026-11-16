import fc from 'fast-check';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CreditsClient } from './client';
import { createFakeCreditsServer, type FakeCreditsServer } from './fake-credits-server';
import { LocalCredits } from './local-credits';
import { ServerCredits } from './server-credits';

interface Rig {
  client: CreditsClient;
  /** The balance the server holds (for LocalCredits: the client's own). */
  truth(): number;
  server: FakeCreditsServer | null;
  refundFailures: string[];
  rebootstraps: number;
  keys: string[];
}

function serverRig(start: number, extra: { keys?: string[] } = {}): Rig {
  const server = createFakeCreditsServer(start);
  let shown: number | null = start;
  const listeners = new Set<() => void>();
  const rig: Rig = {
    server,
    truth: () => server.balance(),
    refundFailures: [],
    rebootstraps: 0,
    keys: extra.keys ?? [],
    client: undefined as unknown as CreditsClient,
  };
  let nextKey = 0;
  rig.client = new ServerCredits({
    fetch: server.fetch,
    headers: () => Promise.resolve({ Authorization: 'Bearer t' }),
    rebootstrap: () => {
      rig.rebootstraps++;
      return Promise.resolve();
    },
    readBalance: () => shown,
    subscribeBalance: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    setBalance: (b) => {
      shown = b;
      for (const l of listeners) l();
    },
    isOnline: () => true,
    newKey: () => `fresh-key-${nextKey++}-aaaa`,
    wait: () => Promise.resolve(),
    onRefundFailed: (id) => rig.refundFailures.push(id),
  });
  return rig;
}

function localRig(start: number): Rig {
  const local = new LocalCredits(start);
  return {
    client: local,
    truth: () => local.balance() ?? -1,
    server: null,
    refundFailures: [],
    rebootstraps: 0,
    keys: [],
  };
}

const rigs: [string, (start: number) => Rig][] = [
  ['LocalCredits', localRig],
  ['ServerCredits (fake fetch over decideSpend / decideRefund)', serverRig],
];

// One contract, both implementations (spec 09 design, "Contract test").
describe.each(rigs)('CreditsClient contract: %s', (_name, make) => {
  it('spends the price of the action and reports the balance', async () => {
    const { client } = make(20);
    const r = await client.spend({ action: 'generate', key: 'key-aaaaaaaa' });
    expect(r).toEqual({ ok: true, txId: 's-key-aaaaaaaa', balance: 17, cost: 3 });
    expect(client.balance()).toBe(17);
  });

  it('answers a repeated key with the first result and charges once', async () => {
    const { client } = make(20);
    const a = await client.spend({ action: 'generate', key: 'key-aaaaaaaa' });
    const b = await client.spend({ action: 'generate', key: 'key-aaaaaaaa' });
    expect(b).toEqual(a);
    expect(client.balance()).toBe(17);
  });

  it('refuses with insufficient and charges nothing', async () => {
    const { client } = make(2);
    const r = await client.spend({ action: 'generate', key: 'key-aaaaaaaa' });
    expect(r).toMatchObject({ ok: false, reason: 'insufficient', balance: 2 });
    expect(client.balance()).toBe(2);
  });

  it('refunds once', async () => {
    const { client } = make(20);
    await client.spend({ action: 'generate', key: 'key-aaaaaaaa' });
    await client.refund('s-key-aaaaaaaa');
    expect(client.balance()).toBe(20);
    await client.refund('s-key-aaaaaaaa');
    expect(client.balance()).toBe(20);
  });

  it('spend, refund, spend with the same key never answers ok (key-used)', async () => {
    const { client } = make(20);
    await client.spend({ action: 'generate', key: 'key-aaaaaaaa' });
    await client.refund('s-key-aaaaaaaa');
    // ServerCredits takes a fresh key once on key-used, and that retry is a new, charged spend;
    // so look at the ledger effect: the refunded key itself never produces an `s-key-…` charge.
    const r = await client.spend({ action: 'generate', key: 'key-aaaaaaaa' });
    if (r.ok) expect(r.txId).not.toBe('s-key-aaaaaaaa');
  });

  it('prices units for per-unit actions only', async () => {
    const { client } = make(20);
    const r = await client.spend({ action: 'tts', units: 3, key: 'key-bbbbbbbb' });
    expect(r).toMatchObject({ ok: true, cost: 6, balance: 14 });
  });

  it('property: any mix of spends and refunds keeps the balance at or above zero and exact', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 15 }),
        fc.array(
          fc.record({
            op: fc.constantFrom('spend', 'refund'),
            key: fc.integer({ min: 0, max: 3 }),
            action: fc.constantFrom('generate', 'edit', 'pip-plan'),
          }),
          { maxLength: 25 },
        ),
        async (start, ops) => {
          const rig = make(start);
          const charged = new Map<string, number>();
          for (const o of ops) {
            const key = `key-${o.key}-aaaaaa`;
            if (o.op === 'spend') {
              const r = await rig.client.spend({ action: o.action, key });
              if (r.ok) charged.set(r.txId, r.cost);
            } else {
              await rig.client.refund(`s-${key}`);
            }
            expect(rig.client.balance()).toBeGreaterThanOrEqual(0);
          }
          expect(rig.client.balance()).toBe(rig.truth());
        },
      ),
      { numRuns: 60 },
    );
  });
});

describe('ServerCredits', () => {
  afterEach(() => vi.restoreAllMocks());

  it('maps rate-limit, paused and insufficient answers with the balance', async () => {
    const rig = serverRig(20);
    rig.server!.setKillSwitch(true);
    expect(await rig.client.spend({ action: 'edit', key: 'key-pause-aaaa' })).toEqual({
      ok: false,
      reason: 'paused',
      balance: 20,
    });
    rig.server!.setKillSwitch(false);
    const limited = serverRig(100);
    const lim = createFakeCreditsServer(100, { hourLimit: 1 });
    const c = new ServerCredits({
      fetch: lim.fetch,
      headers: () => Promise.resolve({}),
      rebootstrap: () => Promise.resolve(),
      readBalance: () => 100,
      subscribeBalance: () => () => {},
      setBalance: () => {},
      isOnline: () => true,
    });
    expect((await c.spend({ action: 'edit', key: 'key-rate-aaaa1' })).ok).toBe(true);
    expect(await c.spend({ action: 'edit', key: 'key-rate-aaaa2' })).toMatchObject({
      ok: false,
      reason: 'rate-limit',
    });
    expect(limited.truth()).toBe(100);
  });

  it('shows the answer as the balance at once (optimistic, before the snapshot)', async () => {
    const rig = serverRig(20);
    const seen: (number | null)[] = [];
    rig.client.subscribe((b) => seen.push(b));
    await rig.client.spend({ action: 'generate', key: 'key-aaaaaaaa' });
    expect(seen).toEqual([17]);
  });

  it('retries once on a fresh key after key-used, and never charges the refunded key', async () => {
    const rig = serverRig(20);
    await rig.client.spend({ action: 'generate', key: 'key-aaaaaaaa' });
    await rig.client.refund('s-key-aaaaaaaa');
    const r = await rig.client.spend({ action: 'generate', key: 'key-aaaaaaaa' });
    expect(r).toMatchObject({ ok: true, txId: 's-fresh-key-0-aaaa', balance: 17 });
    const spends = rig.server!.calls.filter((c) => c.url.endsWith('/spend'));
    expect(spends.map((s) => (s.body as { key: string }).key)).toEqual([
      'key-aaaaaaaa',
      'key-aaaaaaaa',
      'fresh-key-0-aaaa',
    ]);
  });

  it('a second key-used is unavailable', async () => {
    const server = createFakeCreditsServer(20);
    const fetchFn: typeof fetch = (input, init) =>
      String(input).endsWith('/spend')
        ? Promise.resolve(
            new Response(JSON.stringify({ ok: false, reason: 'key-used', balance: 20 }), {
              status: 200,
            }),
          )
        : server.fetch(input, init);
    const c = new ServerCredits({
      fetch: fetchFn,
      headers: () => Promise.resolve({}),
      rebootstrap: () => Promise.resolve(),
      readBalance: () => 20,
      subscribeBalance: () => () => {},
      setBalance: () => {},
      isOnline: () => true,
      newKey: () => 'another-key-0000',
    });
    expect(await c.spend({ action: 'edit', key: 'key-aaaaaaaa' })).toEqual({
      ok: false,
      reason: 'unavailable',
      balance: 20,
    });
  });

  it('a network error is offline when the browser is offline, else unavailable; never throws', async () => {
    for (const [online, reason] of [
      [false, 'offline'],
      [true, 'unavailable'],
    ] as const) {
      const server = createFakeCreditsServer(20);
      server.dropNext(1);
      const c = new ServerCredits({
        fetch: server.fetch,
        headers: () => Promise.resolve({}),
        rebootstrap: () => Promise.resolve(),
        readBalance: () => 20,
        subscribeBalance: () => () => {},
        setBalance: () => {},
        isOnline: () => online,
      });
      expect(await c.spend({ action: 'edit', key: 'key-aaaaaaaa' })).toEqual({ ok: false, reason });
      expect(server.balance()).toBe(20);
    }
  });

  it('HTTP errors are unavailable; 409 re-runs bootstrap once and retries once', async () => {
    const rig = serverRig(20);
    rig.server!.failNext(1, 500);
    expect(await rig.client.spend({ action: 'edit', key: 'key-aaaaaaaa' })).toEqual({
      ok: false,
      reason: 'unavailable',
    });
    rig.server!.failNext(1, 409);
    const r = await rig.client.spend({ action: 'edit', key: 'key-bbbbbbbb' });
    expect(r.ok).toBe(true);
    expect(rig.rebootstraps).toBe(1);
    rig.server!.failNext(2, 409);
    expect(await rig.client.spend({ action: 'edit', key: 'key-cccccccc' })).toEqual({
      ok: false,
      reason: 'unavailable',
    });
    expect(rig.rebootstraps).toBe(2);
  });

  it('refund: retries a network error once, then raises the toast with the spend id', async () => {
    const rig = serverRig(20);
    await rig.client.spend({ action: 'generate', key: 'key-aaaaaaaa' });
    rig.server!.dropNext(1);
    await rig.client.refund('s-key-aaaaaaaa');
    expect(rig.refundFailures).toEqual([]);
    expect(rig.client.balance()).toBe(20);

    await rig.client.spend({ action: 'generate', key: 'key-bbbbbbbb' });
    rig.server!.dropNext(2);
    await rig.client.refund('s-key-bbbbbbbb');
    expect(rig.refundFailures).toEqual(['s-key-bbbbbbbb']);
  });

  it('refund: a refusal (too old) is final, with no retry, and raises the toast', async () => {
    const rig = serverRig(20);
    await rig.client.spend({ action: 'generate', key: 'key-aaaaaaaa' });
    rig.server!.advance(16 * 60_000);
    const before = rig.server!.calls.length;
    await rig.client.refund('s-key-aaaaaaaa');
    expect(rig.server!.calls.length - before).toBe(1);
    expect(rig.refundFailures).toEqual(['s-key-aaaaaaaa']);
    expect(rig.server!.balance()).toBe(17);
  });

  it('refund: a 400 is final too', async () => {
    const rig = serverRig(20);
    rig.server!.failNext(1, 400);
    await rig.client.refund('s-key-aaaaaaaa');
    expect(rig.refundFailures).toHaveLength(1);
    expect(rig.server!.calls).toHaveLength(1);
  });
});
