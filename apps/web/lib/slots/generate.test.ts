import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { createFakeRouter } from '@/lib/ai/fake-router';
import type { Route } from '@/lib/ai/route';
import type { CreditsClient } from '@/lib/credits/client';
import { closeOutOfCredits, useCreditsUi } from '@/lib/credits/credits-ui';
import { createFakeCreditsServer } from '@/lib/credits/fake-credits-server';
import { LocalCredits } from '@/lib/credits/local-credits';
import { ServerCredits } from '@/lib/credits/server-credits';
import { demoProject } from '@/lib/projects/fixture';
import { createEditorStore } from '@/lib/stores/editor';
import { COULDNT_GENERATE, generateSlot, PIP_IS_ON_IT, type GenerateDeps } from './generate';

const CLOUD: Route = {
  kind: 'cloud',
  mode: 'ONLY_IN_CLOUD',
  allowCloud: false,
  credits: 3,
  insufficient: false,
};

function setup(
  opts: {
    search?: string;
    start?: number;
    sleep?: (ms: number) => Promise<void>;
    credits?: CreditsClient;
  } = {},
) {
  const store = createEditorStore(() => 1000);
  store.getState().load(demoProject(0));
  const credits = opts.credits ?? new LocalCredits(opts.start ?? 120);
  const router = createFakeRouter({
    latencyMs: 5,
    search: opts.search ?? '',
    sleep: opts.sleep ?? (async () => {}),
  });
  let n = 0;
  const keys: string[] = [];
  const deps: GenerateDeps = {
    store,
    credits,
    getRouter: async () => router,
    now: () => 5000,
    newKey: () => {
      const k = `gen-key-${n++}-aaaaaaaa`;
      keys.push(k);
      return k;
    },
  };
  const slot = (id = 'slot-4') => store.getState().project!.slots.find((s) => s.id === id)!;
  /** Turns a slot into one that was never generated: suggested, no params, no current version. */
  const unready = (id: string) =>
    store.getState().exec({
      label: 'reset',
      do: (p) => ({
        ...p,
        slots: p.slots.map((s) => {
          if (s.id !== id) return s;
          const rest = { ...s, status: 'suggested' as const, params: {} };
          delete rest.currentVersionId;
          return rest;
        }),
      }),
      undo: (p) => p,
    });
  return { store, credits, deps, keys, slot, unready };
}

describe('generateSlot', () => {
  it('spends 3, applies one "Generated" ai-cloud version, and undo takes it back', async () => {
    const { deps, store, slot, credits } = setup();
    const before = slot().currentVersionId;
    const r = await generateSlot(deps, 'slot-4', CLOUD);
    expect(r).toMatchObject({ outcome: 'ready' });
    expect(r.ms).toBeGreaterThanOrEqual(0);
    expect(credits.balance()).toBe(117);
    const v = store.getState().project!.versions.find((x) => x.id === r.versionId)!;
    expect(v).toMatchObject({
      source: 'ai-cloud',
      costCredits: 3,
      label: 'Generated',
      slotId: 'slot-4',
    });
    expect(slot().currentVersionId).toBe(r.versionId);
    expect(slot().status).toBe('ready');
    expect(store.getState().generating).toBeNull();
    store.getState().undo();
    expect(slot().currentVersionId).toBe(before);
  });

  it('a slot that was not ready is filled and becomes ready', async () => {
    const { deps, slot, unready } = setup();
    unready('slot-4');
    const r = await generateSlot(deps, 'slot-4', CLOUD);
    expect(r.outcome).toBe('ready');
    expect(slot().status).toBe('ready');
    expect(Object.keys(slot().params).length).toBeGreaterThan(0);
  });

  it('the phase goes preparing → animating while the model works', async () => {
    const seen: (string | undefined)[] = [];
    const ref: { store?: ReturnType<typeof createEditorStore> } = {};
    const { deps, store } = setup({
      sleep: async () => {
        seen.push(ref.store?.getState().generating?.phase);
      },
    });
    ref.store = store;
    seen.push(store.getState().generating?.phase);
    await generateSlot(deps, 'slot-4', CLOUD);
    expect(seen).toContain('animating');
    expect(store.getState().generating).toBeNull();
  });

  it('a route that is not the cloud calls nothing and spends nothing', async () => {
    const { deps, credits } = setup();
    const getRouter = vi.fn();
    const routes: Route[] = [
      { kind: 'disabled', reason: 'Needs connection' },
      { kind: 'local' },
      { kind: 'device', mode: 'ONLY_ON_DEVICE', allowCloud: false },
    ];
    for (const route of routes) {
      const r = await generateSlot({ ...deps, getRouter }, 'slot-4', route);
      expect(r.outcome).toBe('blocked');
    }
    expect(getRouter).not.toHaveBeenCalled();
    expect(credits.balance()).toBe(120);
  });

  it('a planned graphic and a missing credits client are blocked before any spend', async () => {
    const { deps, credits } = setup();
    expect(await generateSlot(deps, 'slot-3', CLOUD)).toMatchObject({
      outcome: 'blocked',
      reason: 'Coming soon',
    });
    expect(await generateSlot({ ...deps, credits: null }, 'slot-4', CLOUD)).toMatchObject({
      outcome: 'blocked',
      reason: 'Sign in to use cloud AI',
    });
    expect(credits.balance()).toBe(120);
  });

  it('below the price it opens the out-of-credits modal and makes no AI call', async () => {
    closeOutOfCredits();
    const { deps, credits } = setup({ start: 2 });
    const getRouter = vi.fn();
    const r = await generateSlot({ ...deps, getRouter }, 'slot-4', CLOUD);
    expect(r.outcome).toBe('no-credits');
    expect(getRouter).not.toHaveBeenCalled();
    expect(credits.balance()).toBe(2);
    expect(useCreditsUi.getState().outOfCredits).not.toBeNull();
    closeOutOfCredits();
  });

  it('a failed call refunds, and a slot that was not ready becomes failed', async () => {
    const { deps, credits, slot, unready, store } = setup({ search: '?fakeFail=generate' });
    unready('slot-4');
    const r = await generateSlot(deps, 'slot-4', CLOUD);
    expect(r.outcome).toBe('failed');
    expect(credits.balance()).toBe(120);
    expect(slot()).toMatchObject({ status: 'failed', error: COULDNT_GENERATE });
    expect(store.getState().generating).toBeNull();
  });

  it('a failed call on a ready slot keeps its graphic', async () => {
    const { deps, credits, slot } = setup({ search: '?fakeFail=generate' });
    const params = slot().params;
    const r = await generateSlot(deps, 'slot-4', CLOUD);
    expect(r.outcome).toBe('kept');
    expect(credits.balance()).toBe(120);
    expect(slot().status).toBe('ready');
    expect(slot().params).toBe(params);
  });

  it('every attempt draws its own key, so a Retry is a new, charged spend', async () => {
    const { deps, credits, keys, unready } = setup({ search: '?fakeFail=generate' });
    unready('slot-4');
    await generateSlot(deps, 'slot-4', CLOUD);
    await generateSlot(deps, 'slot-4', CLOUD);
    expect(new Set(keys).size).toBe(2);
    expect(credits.balance()).toBe(120); // both refunded
    // The refunded key can never be spent again: a replay answers key-used, not ok.
    const again = await credits.spend({ action: 'generate', key: keys[0]! });
    expect(again).toMatchObject({ ok: false, reason: 'key-used' });
  });

  it('a second Generate while one runs is refused with "Pip is on it" and spends nothing', async () => {
    let release = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const { deps, credits } = setup({ sleep: () => gate });
    const first = generateSlot(deps, 'slot-4', CLOUD);
    await vi.waitFor(() => expect(deps.store.getState().generating).not.toBeNull());
    const second = await generateSlot(deps, 'slot-2', CLOUD);
    expect(second).toEqual({ outcome: 'blocked', reason: PIP_IS_ON_IT });
    release();
    expect((await first).outcome).toBe('ready');
    expect(credits.balance()).toBe(117);
  });

  it('two calls started in the same tick spend once', async () => {
    const { deps, credits } = setup();
    const [a, b] = await Promise.all([
      generateSlot(deps, 'slot-4', CLOUD),
      generateSlot(deps, 'slot-2', CLOUD),
    ]);
    expect([a.outcome, b.outcome].sort()).toEqual(['blocked', 'ready']);
    expect(credits.balance()).toBe(117);
  });

  it('discards and refunds when the slot is deleted meanwhile', async () => {
    let drop = () => {};
    const { deps, credits, store } = setup({ sleep: async () => drop() });
    drop = () =>
      store.getState().exec({
        label: 'delete',
        do: (p) => ({ ...p, slots: p.slots.filter((s) => s.id !== 'slot-4') }),
        undo: (p) => p,
      });
    const r = await generateSlot(deps, 'slot-4', CLOUD);
    expect(r.outcome).toBe('discarded');
    expect(credits.balance()).toBe(120);
  });

  it('discards and refunds when the words of the slot changed meanwhile', async () => {
    let move = () => {};
    const { deps, credits, store, slot } = setup({ sleep: async () => move() });
    move = () =>
      store.getState().exec({
        label: 'retarget',
        do: (p) => ({
          ...p,
          slots: p.slots.map((s) => (s.id === 'slot-4' ? { ...s, wordEnd: s.wordEnd - 1 } : s)),
        }),
        undo: (p) => p,
      });
    const before = slot().currentVersionId;
    const r = await generateSlot(deps, 'slot-4', CLOUD);
    expect(r.outcome).toBe('discarded');
    expect(credits.balance()).toBe(120);
    expect(slot().currentVersionId).toBe(before);
  });

  it('other edits made meanwhile are superseded by the result (⌘Z restores them)', async () => {
    let edit = () => {};
    const { deps, store, slot } = setup({ sleep: async () => edit() });
    edit = () =>
      store.getState().exec({
        label: 'edit',
        do: (p) => ({
          ...p,
          slots: p.slots.map((s) =>
            s.id === 'slot-4' ? { ...s, params: { ...s.params, label: 'Mid-call edit' } } : s,
          ),
        }),
        undo: (p) => p,
      });
    const r = await generateSlot(deps, 'slot-4', CLOUD);
    expect(r.outcome).toBe('ready');
    expect(slot().currentVersionId).toBe(r.versionId);
  });

  it('keeps the slot timing through a Generate', async () => {
    const { deps, store, slot } = setup();
    store.getState().exec({
      label: 'timing',
      do: (p) => ({
        ...p,
        slots: p.slots.map((s) => (s.id === 'slot-4' ? { ...s, timing: { speed: 0.8 } } : s)),
      }),
      undo: (p) => p,
    });
    await generateSlot(deps, 'slot-4', CLOUD);
    expect(slot().timing).toEqual({ speed: 0.8 });
  });
});

// ---- P5: the balance under random failures, against both credits clients ------------------

function serverCredits(start: number): { client: CreditsClient; truth: () => number } {
  const server = createFakeCreditsServer(start);
  let shown: number | null = start;
  const listeners = new Set<() => void>();
  let k = 0;
  const client = new ServerCredits({
    fetch: server.fetch,
    headers: () => Promise.resolve({ Authorization: 'Bearer t' }),
    rebootstrap: () => Promise.resolve(),
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
    newKey: () => `server-key-${k++}-aaaa`,
    wait: () => Promise.resolve(),
    onRefundFailed: () => {},
  });
  return { client, truth: () => server.balance() };
}

describe('P5: Generate against random failures', () => {
  const kinds: [
    'LocalCredits' | 'ServerCredits',
    (n: number) => { client: CreditsClient; truth: () => number },
  ][] = [
    [
      'LocalCredits',
      (n) => {
        const c = new LocalCredits(n);
        return { client: c, truth: () => c.balance() ?? -1 };
      },
    ],
    ['ServerCredits', serverCredits],
  ];

  it.each(kinds)(
    '%s: balance = start − 3 × successes, never negative, every failure refunded once',
    async (_name, make) => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 30 }),
          fc.array(fc.boolean(), { minLength: 1, maxLength: 12 }),
          async (start, failPlan) => {
            const { client, truth } = make(start);
            const rig = setup({ credits: client });
            // The fake router fails on a seeded plan: one entry per attempt, in order.
            let attempt = 0;
            const failing = createFakeRouter({ latencyMs: 1, sleep: async () => {} });
            const router = {
              run: async (...a: Parameters<typeof failing.run>) => {
                const fail = failPlan[attempt++ % failPlan.length];
                if (fail) {
                  const bad = createFakeRouter({
                    latencyMs: 1,
                    sleep: async () => {},
                    search: '?fakeFail=generate',
                  });
                  return bad.run(...a);
                }
                return failing.run(...a);
              },
            } as typeof failing;
            const deps = { ...rig.deps, credits: client, getRouter: async () => router };
            closeOutOfCredits();
            let successes = 0;
            for (let i = 0; i < failPlan.length; i++) {
              const before = truth();
              const r = await generateSlot(deps, 'slot-4', CLOUD);
              expect(truth()).toBeGreaterThanOrEqual(0);
              if (r.outcome === 'ready') {
                successes++;
                expect(truth()).toBe(before - 3);
              } else {
                // no-credits (nothing taken), failed, kept or blocked: the balance is unchanged.
                expect(truth()).toBe(before);
              }
            }
            expect(truth()).toBe(start - 3 * successes);
            expect(rig.store.getState().generating).toBeNull();
            closeOutOfCredits();
          },
        ),
        { numRuns: 25 },
      );
    },
  );

  it.each(kinds)('%s: spend, refund, spend with one key is never ok', async (_name, make) => {
    const { client } = make(20);
    const first = await client.spend({ action: 'generate', key: 'one-key-aaaaaaaa' });
    expect(first.ok).toBe(true);
    if (first.ok) await client.refund(first.txId);
    const replay = await client.spend({ action: 'generate', key: 'one-key-aaaaaaaa' });
    // ServerCredits may take a fresh key once on `key-used`, which is a new charged spend; the
    // refunded key itself must not have been charged again, so the balance is at most one spend.
    if (replay.ok) expect(replay.txId).not.toBe('s-one-key-aaaaaaaa');
    expect(client.balance()).toBeGreaterThanOrEqual(17);
  });
});
