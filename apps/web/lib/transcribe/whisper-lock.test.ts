import fc from 'fast-check';
import { afterEach, describe, expect, it } from 'vitest';
import { whisperQueueState, withWhisper, type WhisperPriority } from './whisper-lock';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

const open: Array<() => void> = [];
/** A held lock: the first request holds it until `release()`. */
function hold(): { release: () => void; done: Promise<void> } {
  const gate = deferred();
  open.push(gate.resolve);
  const done = withWhisper('prep', () => gate.promise);
  return { release: gate.resolve, done };
}

afterEach(async () => {
  open.splice(0).forEach((r) => r());
  // Let the lock drain so one test never leaks a busy lock into the next.
  await withWhisper('prep', async () => undefined);
});

describe('withWhisper', () => {
  it('runs one at a time', async () => {
    let running = 0;
    let peak = 0;
    const work = async () => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 2));
      running--;
    };
    await Promise.all([1, 2, 3, 4].map(() => withWhisper('prep', work)));
    expect(peak).toBe(1);
    expect(whisperQueueState()).toEqual({ waiting: 0, busy: false });
  });

  it("a 'job' goes before a waiting 'prep'", async () => {
    const order: string[] = [];
    const h = hold();
    const prep = withWhisper('prep', async () => void order.push('prep'));
    const job = withWhisper('job', async () => void order.push('job'));
    expect(whisperQueueState()).toEqual({ waiting: 2, busy: true });
    h.release();
    await Promise.all([h.done, prep, job]);
    expect(order).toEqual(['job', 'prep']);
  });

  it('is first come first served within a priority', async () => {
    const order: string[] = [];
    const h = hold();
    const all = (['prep', 'job', 'prep', 'job'] as const).map((p, i) =>
      withWhisper(p, async () => void order.push(`${p}${i}`)),
    );
    h.release();
    await Promise.all([h.done, ...all]);
    expect(order).toEqual(['job1', 'job3', 'prep0', 'prep2']);
  });

  it('reads a priority getter each time the lock picks (a submitted prep rises)', async () => {
    const order: string[] = [];
    let priority: WhisperPriority = 'prep';
    const h = hold();
    const first = withWhisper('prep', async () => void order.push('other'));
    const rising = withWhisper(
      () => priority,
      async () => void order.push('rising'),
    );
    priority = 'job';
    h.release();
    await Promise.all([h.done, first, rising]);
    expect(order).toEqual(['rising', 'other']);
  });

  it('an aborted waiter leaves the queue and rejects with AbortError, never running', async () => {
    const h = hold();
    const ctl = new AbortController();
    let ran = false;
    const waiter = withWhisper(
      'job',
      async () => {
        ran = true;
      },
      ctl.signal,
    );
    const rejected = expect(waiter).rejects.toMatchObject({ name: 'AbortError' });
    expect(whisperQueueState().waiting).toBe(1);
    ctl.abort();
    await rejected;
    expect(whisperQueueState().waiting).toBe(0);
    h.release();
    await h.done;
    expect(ran).toBe(false);
  });

  it('an already aborted signal rejects at once and does not queue', async () => {
    const ctl = new AbortController();
    ctl.abort();
    let ran = false;
    await expect(
      withWhisper(
        'job',
        async () => {
          ran = true;
        },
        ctl.signal,
      ),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(ran).toBe(false);
    expect(whisperQueueState()).toEqual({ waiting: 0, busy: false });
  });

  it('aborting a request that already started does not stop it', async () => {
    const ctl = new AbortController();
    const gate = deferred();
    open.push(gate.resolve);
    const p = withWhisper('job', () => gate.promise.then(() => 'finished'), ctl.signal);
    ctl.abort();
    gate.resolve();
    await expect(p).resolves.toBe('finished');
  });

  it('a failing request frees the lock for the next one', async () => {
    const failing = withWhisper('prep', () => Promise.reject(new Error('worker crashed')));
    const next = withWhisper('prep', async () => 'ok');
    await expect(failing).rejects.toThrow('worker crashed');
    await expect(next).resolves.toBe('ok');
    expect(whisperQueueState()).toEqual({ waiting: 0, busy: false });
  });

  it('runs every job before every prep, each in arrival order (property)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.constantFrom<WhisperPriority>('job', 'prep'), { minLength: 1, maxLength: 12 }),
        async (priorities) => {
          const order: number[] = [];
          const h = hold();
          const runs = priorities.map((p, i) => withWhisper(p, async () => void order.push(i)));
          h.release();
          await Promise.all([h.done, ...runs]);
          const jobs = priorities.flatMap((p, i) => (p === 'job' ? [i] : []));
          const preps = priorities.flatMap((p, i) => (p === 'prep' ? [i] : []));
          expect(order).toEqual([...jobs, ...preps]);
        },
      ),
      { numRuns: 60 },
    );
  });
});
