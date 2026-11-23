/**
 * One on-device transcription at a time (spec 39 R6.3, review fix #4). Whisper holds a large model
 * and a worker; preparation on the configure screen and running jobs share it. A running job's
 * request ('job') goes ahead of any waiting preparation ('prep'). FIFO within a priority.
 */
export type WhisperPriority = 'job' | 'prep';

/** A fixed priority, or a getter read each time the lock picks (a submitted job's prep rises). */
export type PriorityArg = WhisperPriority | (() => WhisperPriority);

interface Waiter {
  priority: PriorityArg;
  start: () => void;
}

const prio = (w: Waiter): WhisperPriority =>
  typeof w.priority === 'function' ? w.priority() : w.priority;

const queue: Waiter[] = [];
let busy = false;

function next(): void {
  if (busy) return;
  const i = queue.findIndex((w) => prio(w) === 'job');
  const w = queue.splice(i >= 0 ? i : 0, 1)[0];
  if (!w) return;
  busy = true;
  w.start();
}

/** Runs `work` when the transcriber is free. An aborted signal leaves the queue at once. */
export function withWhisper<T>(
  priority: PriorityArg,
  work: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const waiter: Waiter = {
      priority,
      start: () => {
        signal?.removeEventListener('abort', onAbort);
        work()
          .then(resolve, reject)
          .finally(() => {
            busy = false;
            next();
          });
      },
    };
    const onAbort = () => {
      const i = queue.indexOf(waiter);
      if (i >= 0) queue.splice(i, 1);
      reject(new DOMException('Transcription was cancelled', 'AbortError'));
    };
    if (signal?.aborted) return onAbort();
    signal?.addEventListener('abort', onAbort, { once: true });
    queue.push(waiter);
    next();
  });
}

/** Test hook: how many are waiting and whether one is running. */
export function whisperQueueState(): { waiting: number; busy: boolean } {
  return { waiting: queue.length, busy };
}
