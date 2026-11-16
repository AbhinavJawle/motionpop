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
  return new Promise((resolve) => {
    const onMessage = (e: MessageEvent<unknown>) => {
      const r = BedResponseSchema.safeParse(e.data);
      if (!r.success || r.data.id !== id) return;
      w.removeEventListener('message', onMessage);
      resolve(r.data);
    };
    w.addEventListener('message', onMessage);
    w.postMessage({ ...req, type: 'mix', id });
  });
}
