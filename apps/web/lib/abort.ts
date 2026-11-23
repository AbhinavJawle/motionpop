/**
 * Small helpers for cancellable paid work (spec 39 design §10 #2): a cancelled call never returns
 * a result, and the caller can refund what it spent.
 */

/** The error a cancelled operation throws (the same one `fetch` and the pipeline use). */
export function abortError(message = 'Cancelled'): DOMException {
  return new DOMException(message, 'AbortError');
}

export const isAbortError = (e: unknown): boolean =>
  e instanceof DOMException && e.name === 'AbortError';

/** Throws an `AbortError` when the signal has already fired. */
export function throwIfAborted(signal?: AbortSignal, message?: string): void {
  if (signal?.aborted) throw abortError(message);
}

/**
 * Settles with `work`, or rejects with an `AbortError` the moment the signal fires. The work keeps
 * running (the AI SDKs take no signal); its late result or error is dropped.
 */
export function raceAbort<T>(work: Promise<T>, signal?: AbortSignal, message?: string): Promise<T> {
  if (!signal) return work;
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortError(message));
    if (signal.aborted) {
      work.catch(() => undefined);
      return onAbort();
    }
    signal.addEventListener('abort', onAbort, { once: true });
    work.then(
      (v) => {
        signal.removeEventListener('abort', onAbort);
        resolve(v);
      },
      (e: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(e);
      },
    );
  });
}
