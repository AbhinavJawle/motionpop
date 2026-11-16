import { readFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { offlineDeps, offlineRuntime, withFakeFailure } from './offline';
import type { Producer } from './ports';

const okProducer: Producer = { render: async () => ({}) };
const args = {} as Parameters<Producer['render']>[0];

describe('offline runtime', () => {
  it('is one store and one bucket per process', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mp-offline-'));
    expect(offlineRuntime(root)).toBe(offlineRuntime(join(root, 'ignored')));
  });
});

describe('MP_RENDER_FAKE_FAIL (spec 08 task 19)', () => {
  it('makes only the producer step throw, and only when set to `producer`', async () => {
    await expect(
      withFakeFailure(okProducer, { MP_RENDER_FAKE_FAIL: 'producer' }).render(args),
    ).rejects.toThrow('injected');
    for (const env of [{}, { MP_RENDER_FAKE_FAIL: 'nothing' }, { MP_RENDER_FAKE_FAIL: '' }]) {
      expect(withFakeFailure(okProducer, env)).toBe(okProducer);
    }
  });

  it('is read by the offline deps', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mp-offline-'));
    const deps = await offlineDeps('r1', { MP_RENDER_FAKE_FAIL: 'producer' }, offlineRuntime(root));
    await expect(deps.producer.render(args)).rejects.toThrow('injected');
  });

  it('is not read by the job entry or the cloud and emulator deps', () => {
    for (const file of ['job.ts', 'job-deps.ts', 'run-render.ts', 'producer.ts']) {
      const source = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8');
      expect(source, file).not.toContain('MP_RENDER_FAKE_FAIL');
    }
  });
});
