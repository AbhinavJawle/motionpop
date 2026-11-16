import { describe, expect, it } from 'vitest';
import { runJob } from './job';
import { RENDER_ID, makeHarness } from './testing/harness';

const quietLog = () => {
  const lines: Record<string, unknown>[] = [];
  return {
    lines,
    log: {
      info: (f: Record<string, unknown>) => lines.push(f),
      error: (f: Record<string, unknown>) => lines.push(f),
    },
  };
};

describe('runJob', () => {
  it('runs the render and exits 0', async () => {
    const h = await makeHarness();
    const { log } = quietLog();
    expect(await runJob({ RENDER_ID }, async () => h.deps, log)).toBe(0);
    expect((await h.store.get(RENDER_ID))?.status).toBe('done');
  });

  it('exits 0 after a handled failure, so Cloud Run never retries', async () => {
    const h = await makeHarness({ skipSnapshot: true });
    const { log } = quietLog();
    expect(await runJob({ RENDER_ID }, async () => h.deps, log)).toBe(0);
    expect(await h.store.get(RENDER_ID)).toMatchObject({ status: 'error', error: 'input-missing' });
  });

  it('exits 0 for a duplicate execution', async () => {
    const h = await makeHarness();
    const { log } = quietLog();
    await runJob({ RENDER_ID }, async () => h.deps, log);
    expect(await runJob({ RENDER_ID }, async () => h.deps, log)).toBe(0);
  });

  it('exits 1 without building any dep for a missing or unsafe render id', async () => {
    let built = 0;
    const { log, lines } = quietLog();
    for (const env of [{}, { RENDER_ID: '' }, { RENDER_ID: '../x' }, { RENDER_ID: 'a/b' }]) {
      expect(await runJob(env, async () => (built++, undefined as never), log)).toBe(1);
    }
    expect(built).toBe(0);
    expect(lines.every((l) => l['outcome'] === 'bad-render-id')).toBe(true);
  });

  it('exits 1 when the failure could not be recorded', async () => {
    const h = await makeHarness({ skipSnapshot: true });
    h.store.fail = async () => {
      throw new Error('firestore is down: token=SECRET');
    };
    const { log, lines } = quietLog();
    expect(await runJob({ RENDER_ID }, async () => h.deps, log)).toBe(1);
    expect(lines.some((l) => l['outcome'] === 'unrecorded' && l['renderId'] === RENDER_ID)).toBe(
      true,
    );
  });

  it('exits 1 when the deps cannot be built (for example the runtime is not built)', async () => {
    const { log, lines } = quietLog();
    const code = await runJob(
      { RENDER_ID },
      async () => {
        throw new Error('the motion runtime is not built');
      },
      log,
    );
    expect(code).toBe(1);
    expect(lines[0]).toMatchObject({ outcome: 'unrecorded' });
  });
});
