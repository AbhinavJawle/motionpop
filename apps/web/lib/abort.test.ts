import { describe, expect, it } from 'vitest';
import { abortError, isAbortError, raceAbort, throwIfAborted } from './abort';

describe('abort helpers', () => {
  it('abortError is an AbortError and nothing else is', () => {
    expect(isAbortError(abortError())).toBe(true);
    expect(isAbortError(new Error('x'))).toBe(false);
    expect(isAbortError(new DOMException('x', 'TimeoutError'))).toBe(false);
  });

  it('throwIfAborted throws only once the signal has fired', () => {
    const c = new AbortController();
    expect(() => throwIfAborted(c.signal)).not.toThrow();
    expect(() => throwIfAborted(undefined)).not.toThrow();
    c.abort();
    expect(() => throwIfAborted(c.signal)).toThrow(/Cancelled/);
  });

  it('raceAbort passes the result through, or rejects the moment the signal fires', async () => {
    const c = new AbortController();
    await expect(raceAbort(Promise.resolve(3), c.signal)).resolves.toBe(3);
    let release!: (v: number) => void;
    const slow = new Promise<number>((r) => (release = r));
    const raced = raceAbort(slow, c.signal);
    c.abort();
    await expect(raced).rejects.toMatchObject({ name: 'AbortError' });
    release(1); // the late result is dropped without an unhandled rejection
  });

  it('raceAbort on an already-fired signal rejects at once and swallows the work’s error', async () => {
    const c = new AbortController();
    c.abort();
    await expect(raceAbort(Promise.reject(new Error('late')), c.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
  });
});
