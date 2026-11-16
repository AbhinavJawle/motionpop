import { describe, expect, it, vi } from 'vitest';
import { createUserStore, EMPTY_USER, parseUserSnapshot, type UserDocListen } from './user-store';

const doc = (credits: number, extra: Record<string, unknown> = {}) => ({
  displayName: 'Ada',
  email: 'a@example.com',
  credits,
  plan: 'free',
  settings: { preferOnDevice: true, captionsDefault: true, defaultFormat: '16:9' },
  schemaVersion: 1,
  createdAt: new Date(0),
  lastSeenAt: new Date(0),
  ...extra,
});

function rig() {
  let push: (d: unknown) => void = () => {};
  let fail: (e: unknown) => void = () => {};
  const stop = vi.fn();
  const listen: UserDocListen = vi.fn((_uid, onData, onError) => {
    push = onData;
    fail = onError;
    return stop;
  });
  return {
    store: createUserStore(listen),
    listen,
    stop,
    push: (d: unknown) => push(d),
    fail: (e: unknown) => fail(e),
  };
}

describe('user store', () => {
  it('parses the doc into balance, plan and settings; a missing doc is all null', () => {
    expect(parseUserSnapshot(undefined)).toBe(EMPTY_USER);
    expect(parseUserSnapshot(doc(12))).toMatchObject({ balance: 12, plan: 'free' });
  });

  it('a doc that does not parse gives nulls (the chip waits) instead of throwing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parseUserSnapshot(doc(12, { settings: 'nope' }))).toBe(EMPTY_USER);
    expect(parseUserSnapshot(doc(-3))).toBe(EMPTY_USER);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('shares one listener per uid and stops it with the last subscriber', () => {
    const r = rig();
    const a = vi.fn();
    const b = vi.fn();
    const offA = r.store.subscribe('u1', a);
    const offB = r.store.subscribe('u1', b);
    expect(r.listen).toHaveBeenCalledTimes(1);
    r.push(doc(20));
    expect(r.store.get('u1').balance).toBe(20);
    expect(a).toHaveBeenCalledTimes(1);
    offA();
    expect(r.stop).not.toHaveBeenCalled();
    offB();
    expect(r.stop).toHaveBeenCalledTimes(1);
  });

  it('notifies only when something changed and keeps the snapshot reference stable', () => {
    const r = rig();
    const fn = vi.fn();
    r.store.subscribe('u1', fn);
    r.push(doc(20));
    const first = r.store.get('u1');
    r.push(doc(20));
    expect(r.store.get('u1')).toBe(first);
    expect(fn).toHaveBeenCalledTimes(1);
    r.push(doc(17));
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('setBalance shows a spend answer until the snapshot catches up', () => {
    const r = rig();
    r.store.subscribe('u1', () => {});
    r.push(doc(20));
    r.store.setBalance('u1', 17);
    expect(r.store.get('u1').balance).toBe(17);
    r.push(doc(17));
    expect(r.store.get('u1').balance).toBe(17);
  });

  it('a listener error empties the snapshot', () => {
    const r = rig();
    r.store.subscribe('u1', () => {});
    r.push(doc(20));
    r.fail(new Error('permission-denied'));
    expect(r.store.get('u1')).toBe(EMPTY_USER);
  });
});
