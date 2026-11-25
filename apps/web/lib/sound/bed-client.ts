import { BedResponseSchema, type BedRequest, type BedResponse } from './bed-messages';

let worker: Worker | undefined;
let nextId = 0;

/** Mixes a bed in `workers/bed.worker.ts`. Only the latest request's answer is kept by callers. */
export function mixInWorker(req: Omit<BedRequest, 'type' | 'id'>): Promise<BedResponse> {
  worker ??= new Worker(new URL('../../workers/bed.worker.ts', import.meta.url), {
    type: 'module',
  });
  const w = worker;
  const id = `b${++nextId}`;
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      w.removeEventListener('message', onMessage);
      w.removeEventListener('error', onError);
      w.removeEventListener('messageerror', onError);
    };
    const onMessage = (e: MessageEvent<unknown>) => {
      const r = BedResponseSchema.safeParse(e.data);
      if (!r.success || r.data.id !== id) return;
      cleanup();
      resolve(r.data);
    };
    const onError = () => {
      cleanup();
      if (worker === w) worker = undefined;
      reject(new Error('Sound bed worker failed'));
    };
    w.addEventListener('message', onMessage);
    w.addEventListener('error', onError);
    w.addEventListener('messageerror', onError);
    w.postMessage({ ...req, type: 'mix', id });
  });
}
