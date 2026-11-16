// Fault injection and properties for the job (spec 08 task 7; R3.7, R3.8, R3.9, R4.2, R6.1).
// Whatever fails and wherever, the render ends `error` with that step's code, the cost comes
// back exactly once, and nothing is left in the work folder or the input folder.
import fc from 'fast-check';
import { stat } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  FormatSchema,
  ResolutionSchema,
  renderDocIssues,
  voicePathFor,
  type RenderErrorCode,
} from '@motionpop/schemas';
import { RenderTimeoutError } from './ports';
import { runRender } from './run-render';
import { OWNER, makeHarness, type Harness, type HarnessOptions } from './testing/harness';

const exists = (p: string) =>
  stat(p).then(
    () => true,
    () => false,
  );

interface Fault {
  step: string;
  code: RenderErrorCode;
  inject: (h: Harness) => void;
}

const boom = (what: string) => async (): Promise<never> => {
  throw new Error(`injected: ${what}`);
};

/** One failure per step of design §8, each with the code the spec gives that step. */
const FAULTS: Fault[] = [
  { step: 'snapshot read', code: 'input-missing', inject: (h) => (h.blobs.read = boom('read')) },
  {
    step: 'voice download',
    code: 'input-missing',
    inject: (h) => (h.blobs.download = boom('download')),
  },
  {
    step: 'voice probe',
    code: 'input-missing',
    inject: (h) =>
      (h.fakes.voiceProbe = () => {
        throw new Error('injected: probe');
      }),
  },
  {
    step: 'voice re-encode',
    code: 'input-missing',
    inject: (h) => (h.fakes.toWav = boom('toWav')),
  },
  {
    step: 'compile',
    code: 'compile-failed',
    // A font the compiler cannot find fails `compileProject` itself.
    inject: (h) => (h.deps.assets = { ...h.deps.assets, fonts: {} }),
  },
  {
    step: 'preflight crash',
    code: 'render-failed',
    inject: (h) => (h.fakes.preflight = boom('chrome')),
  },
  {
    step: 'preflight slot error',
    code: 'slot-failed',
    inject: (h) => (h.fakes.preflight = async () => [{ slotId: 'a', message: 'build: injected' }]),
  },
  { step: 'producer', code: 'render-failed', inject: (h) => (h.fakes.produce = boom('producer')) },
  {
    step: 'producer timeout',
    code: 'timeout',
    inject: (h) =>
      (h.fakes.produce = async () => {
        throw new RenderTimeoutError();
      }),
  },
  {
    step: 'output probe',
    code: 'render-failed',
    inject: (h) =>
      (h.fakes.outputProbe = () => {
        throw new Error('injected: ffprobe');
      }),
  },
  {
    step: 'output mismatch',
    code: 'render-failed',
    inject: (h) =>
      (h.fakes.outputProbe = () => ({ durationMs: 1, audioStreams: 0, videoStreams: 0 })),
  },
  { step: 'thumbnail', code: 'render-failed', inject: (h) => (h.fakes.frame = boom('frame')) },
  {
    step: 'upload of the video',
    code: 'upload-failed',
    inject: (h) =>
      (h.fakes.upload = async (p) => {
        if (p.endsWith('video.mp4')) throw new Error('injected: 503');
      }),
  },
  {
    step: 'upload of the thumbnail',
    code: 'upload-failed',
    inject: (h) =>
      (h.fakes.upload = async (p) => {
        if (p.endsWith('thumb.jpg')) throw new Error('injected: 503');
      }),
  },
  {
    step: 'marking done',
    code: 'internal',
    inject: (h) => (h.store.markDone = boom('markDone')),
  },
];

/** What every failed render must look like, whatever failed. */
async function expectFailedCleanly(h: Harness, code: RenderErrorCode, cost: number) {
  const doc = (await h.store.get(h.renderId))!;
  expect(doc.status).toBe('error');
  expect(doc.error).toBe(code);
  expect(doc.errorMessage?.length ?? 0).toBeGreaterThan(0);
  expect(doc.errorMessage).not.toMatch(/injected|users\/|https?:/); // safe to show
  expect(renderDocIssues(doc)).toEqual([]);
  // The cost is back exactly once.
  expect(h.store.refundsOf(h.renderId)).toHaveLength(cost > 0 ? 1 : 0);
  expect(h.store.balances.get(OWNER)).toBe(15 + cost);
  // Nothing left: no work folder, no heartbeat, no snapshot, no half-uploaded output.
  expect(await exists(h.workDir)).toBe(false);
  expect(h.clock.timers.size).toBe(0);
  const left = (await h.leftovers()).blobs;
  expect(left.filter((p) => p.startsWith(h.paths.inputDir))).toEqual([]);
  expect(left).not.toContain(h.paths.output);
  expect(left).not.toContain(h.paths.thumb);
}

describe('a failure injected at every step', () => {
  for (const fault of FAULTS) {
    it(`${fault.step}: ends ${fault.code}, one refund, nothing left behind`, async () => {
      const h = await makeHarness({ cost: 5 });
      fault.inject(h);
      expect(await runRender(h.renderId, h.deps)).toBe('error');
      await expectFailedCleanly(h, fault.code, 5);
      // One structured line with the same code, and the real error is in the log, not the doc.
      const line = h.logs.find((l) => l.fields['event'] === 'render');
      expect(line?.fields).toMatchObject({ outcome: 'error', code: fault.code });
    });
  }

  it('the same holds for any step, format, resolution, title and cost (property)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...FAULTS),
        fc.constantFrom(...FormatSchema.options),
        fc.constantFrom(...ResolutionSchema.options),
        fc.string({ maxLength: 120 }),
        fc.constantFrom(0, 3, 5, 10),
        async (fault, format, resolution, title, cost) => {
          const h = await makeHarness({ format, resolution, title, cost });
          fault.inject(h);
          expect(await runRender(h.renderId, h.deps)).toBe('error');
          await expectFailedCleanly(h, fault.code, cost);
        },
      ),
      { numRuns: 60 },
    );
  });

  it('a render with a free (0 credit) cost fails without a refund entry', async () => {
    const h = await makeHarness({ cost: 0 });
    FAULTS[7]!.inject(h);
    await runRender(h.renderId, h.deps);
    expect(h.store.ledger).toEqual([]);
  });
});

describe('input paths are re-validated before any read (R3.9)', () => {
  const VALID_VOICE = `users/${OWNER}/audio/fixture/voice-0123456789abcdef.wav`;
  const mutate = (path: string, how: number, junk: string): string => {
    const parts = path.split('/');
    switch (how) {
      case 0:
        return path.replace(OWNER, junk || 'x');
      case 1:
        return path.replace('/fixture/', `/${junk || 'other'}/`);
      case 2:
        return path.replace('/audio/', '/media/');
      case 3:
        return path + '/' + junk;
      case 4:
        return parts
          .slice(0, 3)
          .concat('..', ...parts.slice(3))
          .join('/');
      case 5:
        return path.replace(/\.wav$/, `.${junk || 'exe'}`);
      case 6:
        return path.replace('voice-0123456789abcdef', `voice-${junk}`);
      default:
        return junk;
    }
  };
  const hostile = fc
    .tuple(fc.integer({ min: 0, max: 7 }), fc.string({ maxLength: 20 }))
    .map(([how, junk]) => mutate(VALID_VOICE, how, junk))
    .filter((p) => !voicePathFor(OWNER, 'fixture').test(p));

  it('any voice path that is not this owner and project’s fails as input-missing without a read', async () => {
    await fc.assert(
      fc.asyncProperty(hostile, async (voicePath) => {
        const h = await makeHarness({ doc: { voicePath } });
        expect(await runRender(h.renderId, h.deps)).toBe('error');
        expect((await h.store.get(h.renderId))?.error).toBe('input-missing');
        expect(h.reads).toEqual([]);
        expect(h.calls).toEqual([]);
        await expectFailedCleanly(h, 'input-missing', 5);
      }),
      { numRuns: 80 },
    );
  });

  it('any input path that is not this render’s snapshot fails as input-missing without a read', async () => {
    const paths = fc
      .tuple(fc.integer({ min: 0, max: 5 }), fc.string({ minLength: 1, maxLength: 12 }))
      .map(([how, junk]) => {
        const real = `users/${OWNER}/projects/fixture/renders/r-test-render-0000000001/input/project.json`;
        switch (how) {
          case 0:
            return real.replace(OWNER, `x${junk}`);
          case 1:
            return real.replace('/fixture/', `/p${junk}/`);
          case 2:
            return real.replace('/r-test-render-0000000001/', `/r${junk}/`);
          case 3:
            return real.replace('/input/', '/output/');
          case 4:
            return `${real}/../../${junk}`;
          default:
            return junk;
        }
      })
      .filter(
        (p) => !p.endsWith('/r-test-render-0000000001/input/project.json') || p.includes('..'),
      );
    await fc.assert(
      fc.asyncProperty(paths, async (inputPath) => {
        const h = await makeHarness({ doc: { inputPath } });
        expect(await runRender(h.renderId, h.deps)).toBe('error');
        expect((await h.store.get(h.renderId))?.error).toBe('input-missing');
        expect(h.reads).toEqual([]);
        await expectFailedCleanly(h, 'input-missing', 5);
      }),
      { numRuns: 60 },
    );
  });

  it('a voice that is not decodable audio fails as input-missing (any stream count and length)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 3 }),
        fc.integer({ min: 0, max: 700_000 }),
        async (audioStreams, voiceMs) => {
          const h = await makeHarness(); // a 12 s project
          h.fakes.voiceProbe = () => ({ durationMs: voiceMs, audioStreams, videoStreams: 0 });
          const outcome = await runRender(h.renderId, h.deps);
          const limit = Math.min(h.project.durationMs + 5000, 600_000);
          const acceptable = audioStreams === 1 && voiceMs > 0 && voiceMs <= limit;
          expect(outcome).toBe(acceptable ? 'done' : 'error');
          if (!acceptable) await expectFailedCleanly(h, 'input-missing', 5);
        },
      ),
      { numRuns: 120 },
    );
  });
});

describe('a render stopped from outside, at any point', () => {
  it('never ends done, keeps the sweeper’s error, refunds once and cleans up (every call index)', async () => {
    // How many port calls a clean run makes.
    const clean = await makeHarness();
    await runRender(clean.renderId, clean.deps);
    const total = clean.calls.length;
    expect(total).toBeGreaterThan(8);

    for (let n = 0; n < total; n++) {
      const h = await makeHarness({ cost: 5 });
      h.hook.onCall = async (_name, index) => {
        if (index === n) await h.store.fail(h.renderId, 'stalled', 'swept in the test');
      };
      expect(await runRender(h.renderId, h.deps), `swept at call ${n} (${clean.calls[n]})`).toBe(
        'error',
      );
      const doc = (await h.store.get(h.renderId))!;
      expect(doc.error, `swept at call ${n}`).toBe('stalled');
      expect(doc.errorMessage).toBe('swept in the test');
      await expectFailedCleanly(h, 'stalled', 5);
    }
  });

  it('stops using the producer once the render is gone (the abort signal fires)', async () => {
    const h = await makeHarness();
    let abortedSeen = false;
    h.fakes.produce = async ({ signal, onProgress }) => {
      await h.store.fail(h.renderId, 'stalled', 'swept');
      h.clock.t += 5000;
      onProgress({ stage: 'rendering', percent: 60 });
      await new Promise((r) => setTimeout(r, 10));
      abortedSeen = signal.aborted;
      throw new Error('aborted by the job');
    };
    await runRender(h.renderId, h.deps);
    expect(abortedSeen).toBe(true);
  });
});

describe('duplicate executions (R3.8)', () => {
  it('two executions at once: one renders, the other exits skipped', async () => {
    const h = await makeHarness();
    const [a, b] = await Promise.all([
      runRender(h.renderId, h.deps),
      runRender(h.renderId, h.deps),
    ]);
    expect([a, b].sort()).toEqual(['done', 'skipped']);
    expect(h.calls.filter((c) => c === 'producer.render')).toHaveLength(1);
    expect(h.store.ledger).toEqual([]);
  });

  it('an execution of a render that already failed does nothing and refunds nothing more', async () => {
    const h = await makeHarness();
    h.fakes.produce = boom('producer');
    await runRender(h.renderId, h.deps);
    const calls = h.calls.length;
    expect(await runRender(h.renderId, h.deps)).toBe('skipped');
    expect(h.calls.length).toBe(calls);
    expect(h.store.refundsOf(h.renderId)).toHaveLength(1);
  });
});

describe('options', () => {
  const opts: HarnessOptions[] = [
    { format: '16:9', resolution: '1080p' },
    { format: '9:16', resolution: '720p' },
    { format: '1:1', resolution: '1080p' },
  ];
  it('a clean render succeeds for every format and resolution with nothing left but the output', async () => {
    for (const o of opts) {
      const h = await makeHarness(o);
      expect(await runRender(h.renderId, h.deps)).toBe('done');
      const left = (await h.leftovers()).blobs.filter((p) => !p.includes('/audio/'));
      expect(left.sort()).toEqual([h.paths.output, h.paths.thumb].sort());
      expect(await exists(h.workDir)).toBe(false);
    }
  });
});
