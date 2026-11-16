// @vitest-environment happy-dom
import type { UsageEvent } from '@motionpop/ai';
import { UsageBatchSchema } from '@motionpop/schemas';
import fc from 'fast-check';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FLUSH_AT_EVENTS, FLUSH_INTERVAL_MS, MAX_BUFFER, UsageReporter } from './reporter';
import { getSessionUsage, recordSessionUsage, resetSessionUsage } from './usage-store';

const ev = (o: Partial<UsageEvent> = {}): UsageEvent => ({
  task: 'edit.patch',
  ranOn: 'device',
  model: 'nano',
  credits: 0,
  cloudCost: 1,
  latencyMs: 250,
  ok: true,
  ...o,
});

function rig(opts: { headers?: () => Promise<HeadersInit>; status?: number } = {}) {
  const sent: { events: { id: string }[]; init: RequestInit }[] = [];
  let status = opts.status ?? 200;
  let reject = false;
  const fetchFn = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
    if (reject) return Promise.reject(new TypeError('Failed to fetch'));
    sent.push({
      events: (JSON.parse(String(init?.body)) as { events: { id: string }[] }).events,
      init: init ?? {},
    });
    return Promise.resolve(new Response('{}', { status }));
  });
  const headers = vi.fn(opts.headers ?? (() => Promise.resolve({ Authorization: 'Bearer t1' })));
  let n = 0;
  const reporter = new UsageReporter({
    fetch: fetchFn as unknown as typeof fetch,
    headers,
    newId: () => `evt${String(n++).padStart(8, '0')}`,
    warn: () => {},
  });
  return {
    reporter,
    fetchFn,
    headers,
    sent,
    setStatus: (s: number) => (status = s),
    setReject: (r: boolean) => (reject = r),
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  resetSessionUsage();
});

describe('UsageReporter', () => {
  it('converts a router event and clamps it to what the route accepts', () => {
    const { reporter } = rig();
    const e = reporter.toEvent(
      ev({
        credits: 99,
        cloudCost: -3,
        latencyMs: 10_000_000,
        attempts: 9,
        problems: ['x'.repeat(500), 'b', 'c', 'd'],
        task: 't'.repeat(80),
      }),
    );
    expect(UsageBatchSchema.safeParse({ events: [e] }).success).toBe(true);
    expect(e).toMatchObject({ credits: 50, cloudCost: 0, latencyMs: 600_000, attempts: 5 });
    expect(e.problems).toHaveLength(3);
    expect(e.problems?.[0]).toHaveLength(200);
  });

  it('flushes every 15 s, not before', async () => {
    const { reporter, sent } = rig();
    const stop = reporter.start();
    reporter.add(ev());
    await vi.advanceTimersByTimeAsync(FLUSH_INTERVAL_MS - 1);
    expect(sent).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(2);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.events).toHaveLength(1);
    expect(reporter.pending).toBe(0);
    stop();
  });

  it('flushes at 20 events', async () => {
    const { reporter, sent } = rig();
    for (let i = 0; i < FLUSH_AT_EVENTS - 1; i++) reporter.add(ev());
    expect(sent).toHaveLength(0);
    reporter.add(ev());
    await vi.advanceTimersByTimeAsync(0);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.events).toHaveLength(20);
  });

  it('flushes when the page is hidden, with keepalive and the cached headers; never calls headers()', async () => {
    const { reporter, sent, headers } = rig();
    const stop = reporter.start();
    reporter.add(ev());
    await reporter.flush(); // a normal flush caches the headers
    expect(headers).toHaveBeenCalledTimes(1);
    reporter.add(ev());
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(headers).toHaveBeenCalledTimes(1);
    expect(sent).toHaveLength(2);
    expect(sent[1]?.init.keepalive).toBe(true);
    expect((sent[1]?.init.headers as Record<string, string>)['Authorization']).toBe('Bearer t1');
    expect(sent[0]?.init.keepalive).toBeUndefined();
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    stop();
  });

  it('with no cached headers yet a hidden flush sends nothing and keeps the events', async () => {
    const { reporter, sent, headers, fetchFn } = rig();
    reporter.add(ev());
    await reporter.flush({ hidden: true });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(headers).not.toHaveBeenCalled();
    expect(sent).toHaveLength(0);
    expect(reporter.pending).toBe(1);
    // warm() caches the headers, so the next hidden flush goes out.
    await reporter.warm();
    await reporter.flush({ hidden: true });
    expect(sent).toHaveLength(1);
    expect(reporter.pending).toBe(0);
  });

  it('keeps events after a failed flush (HTTP error, network error, no token) and sends them next time', async () => {
    const r = rig();
    r.reporter.add(ev());
    r.setStatus(500);
    await r.reporter.flush();
    expect(r.reporter.pending).toBe(1);
    r.setStatus(200);
    r.setReject(true);
    await r.reporter.flush();
    expect(r.reporter.pending).toBe(1);
    r.setReject(false);
    await r.reporter.flush();
    expect(r.reporter.pending).toBe(0);

    const noToken = rig({ headers: () => Promise.reject(new Error('signed out')) });
    noToken.reporter.add(ev());
    await noToken.reporter.flush();
    expect(noToken.reporter.pending).toBe(1);
    expect(noToken.fetchFn).not.toHaveBeenCalled();
  });

  it('sends at most 50 events per request', async () => {
    const r = rig();
    // Fill without triggering the 20-event flush by failing it first.
    r.setStatus(500);
    for (let i = 0; i < 120; i++) r.reporter.add(ev());
    await vi.advanceTimersByTimeAsync(0);
    r.setStatus(200);
    r.sent.length = 0;
    await r.reporter.flush();
    expect(r.sent.map((s) => s.events.length)).toEqual([50, 50, 20]);
    expect(r.reporter.pending).toBe(0);
  });

  it('drops the oldest above 200 buffered and counts them', async () => {
    const r = rig();
    r.setStatus(500);
    for (let i = 0; i < MAX_BUFFER + 15; i++) r.reporter.add(ev());
    await vi.advanceTimersByTimeAsync(0);
    expect(r.reporter.pending).toBe(MAX_BUFFER);
    expect(r.reporter.dropped).toBe(15);
  });

  it('property: every event reaches the server at least once and the buffer ends empty, whatever fails', async () => {
    vi.useRealTimers();
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.constantFrom('add', 'flush-ok', 'flush-fail', 'flush-hidden'), {
          maxLength: 40,
        }),
        async (ops) => {
          const r = rig();
          const all = new Set<string>();
          for (const op of ops) {
            if (op === 'add') all.add(r.reporter.add(ev()).id);
            else {
              r.setStatus(op === 'flush-fail' ? 500 : 200);
              await r.reporter.flush({ hidden: op === 'flush-hidden' });
            }
          }
          r.setStatus(200);
          await r.reporter.flush();
          const seen = r.sent.flatMap((s) => s.events.map((e) => e.id));
          // Every event arrived at least once, and the buffer is empty. A failed request may have
          // reached the server (so it can repeat); the server drops repeats by id.
          for (const id of all) expect(seen).toContain(id);
          expect(r.reporter.pending).toBe(0);
        },
      ),
      { numRuns: 60 },
    );
  });
});

describe('session usage store (local mode)', () => {
  it('counts the session without any network', () => {
    const { reporter } = rig();
    const before = getSessionUsage();
    recordSessionUsage(reporter.toEvent(ev({ latencyMs: 300, cloudCost: 3 })));
    recordSessionUsage(reporter.toEvent(ev({ ranOn: 'cloud', latencyMs: 2000, credits: 3 })));
    const now = getSessionUsage();
    expect(now).not.toBe(before);
    expect(now).toMatchObject({ device: 1, cloud: 1, saved: 3 });
  });
});
