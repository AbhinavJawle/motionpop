import { describe, expect, it } from 'vitest';
import { renderDocIssues } from '@motionpop/schemas';
import { makeHarness, OWNER } from '../testing/harness';
import { decideFail } from './logic';

describe('decideFail', () => {
  it('leaves a final render alone', async () => {
    const h = await makeHarness();
    expect(decideFail({ ...h.doc, status: 'done', progress: 100 }, false)).toEqual({
      kind: 'noop',
      reason: 'final',
    });
    expect(decideFail({ ...h.doc, status: 'error', error: 'stalled' }, false).kind).toBe('noop');
  });

  it('refunds an active render once', async () => {
    const h = await makeHarness({ cost: 5 });
    for (const status of ['queued', 'rendering', 'encoding'] as const) {
      expect(decideFail({ ...h.doc, status }, false)).toEqual({ kind: 'fail', refund: 5 });
      expect(decideFail({ ...h.doc, status }, true)).toEqual({ kind: 'fail', refund: 0 });
    }
  });
});

describe('MemoryRenderStore', () => {
  it('moves queued → rendering → encoding → done and keeps the doc valid at each step', async () => {
    const h = await makeHarness();
    const { store, renderId } = h;
    const valid = async () => expect(renderDocIssues((await store.get(renderId))!)).toEqual([]);
    expect(await store.markStarted(renderId)).toBe(true);
    expect(await store.markStarted(renderId)).toBe(false);
    await valid();
    expect(await store.progress(renderId, 'rendering', 40)).toBe('ok');
    expect((await store.get(renderId))?.status).toBe('rendering');
    expect(await store.progress(renderId, 'encoding', 90)).toBe('ok');
    expect(await store.progress(renderId, 'rendering', 95)).toBe('ok'); // never goes back
    expect((await store.get(renderId))?.status).toBe('encoding');
    expect(await store.progress(renderId, 'encoding', 10)).toBe('ok'); // never lowers
    expect((await store.get(renderId))?.progress).toBe(95);
    await valid();
    expect(await store.markDone(renderId, { outputPath: 'o', thumbPath: 't', sizeBytes: 3 })).toBe(
      'ok',
    );
    expect(await store.get(renderId)).toMatchObject({ status: 'done', progress: 100 });
    await valid();
    expect(await store.progress(renderId, 'encoding', 99)).toBe('inactive');
    expect(await store.heartbeat(renderId)).toBe('inactive');
  });

  it('cannot go to done from rendering, and caps progress below 100 until done', async () => {
    const h = await makeHarness();
    await h.store.markStarted(h.renderId);
    expect(
      await h.store.markDone(h.renderId, { outputPath: 'o', thumbPath: 't', sizeBytes: 1 }),
    ).toBe('inactive');
    await h.store.progress(h.renderId, 'encoding', 100);
    expect((await h.store.get(h.renderId))?.progress).toBe(99);
  });

  it('fails an active render with one refund, however often it is asked', async () => {
    const h = await makeHarness({ cost: 5 });
    await h.store.markStarted(h.renderId);
    await Promise.all([
      h.store.fail(h.renderId, 'stalled', 'a'),
      h.store.fail(h.renderId, 'render-failed', 'b'),
    ]);
    await h.store.fail(h.renderId, 'internal', 'c');
    expect(h.store.refundsOf(h.renderId)).toHaveLength(1);
    expect(h.store.balances.get(OWNER)).toBe(20);
    const doc = (await h.store.get(h.renderId))!;
    expect(doc).toMatchObject({ status: 'error', error: 'stalled', errorMessage: 'a' });
    expect(renderDocIssues(doc)).toEqual([]);
  });

  it('does not touch a done render', async () => {
    const h = await makeHarness();
    await h.store.markStarted(h.renderId);
    await h.store.progress(h.renderId, 'encoding', 90);
    await h.store.markDone(h.renderId, { outputPath: 'o', thumbPath: 't', sizeBytes: 1 });
    await h.store.fail(h.renderId, 'stalled', 'late');
    expect((await h.store.get(h.renderId))?.status).toBe('done');
    expect(h.store.ledger).toEqual([]);
  });

  it('truncates the message to 200 characters', async () => {
    const h = await makeHarness();
    await h.store.fail(h.renderId, 'internal', 'x'.repeat(500));
    expect((await h.store.get(h.renderId))?.errorMessage).toHaveLength(200);
  });
});
