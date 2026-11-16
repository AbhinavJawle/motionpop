import type { ChatMessage } from '@motionpop/schemas';
import { describe, expect, it } from 'vitest';
import { KEEP, loadThread, saveThread } from './persist';

function memory() {
  const m = new Map<string, string>();
  return {
    m,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

const msg = (i: number, extra: Partial<ChatMessage> = {}): ChatMessage => ({
  schemaVersion: 1,
  id: `m-${i}`,
  threadId: 'main',
  role: i % 2 ? 'pip' : 'user',
  text: `hello ${i}`,
  scope: { kind: 'video' },
  credits: 0,
  createdAt: 1000 + i,
  ...extra,
});

describe('Pip thread persistence', () => {
  it('round-trips a thread per project and drops in-memory fields', () => {
    const s = memory();
    const withHandle = { ...msg(1), entries: [{ label: 'x' }] } as unknown as ChatMessage;
    saveThread('p1', [msg(0), withHandle], s);
    const back = loadThread('p1', s);
    expect(back.map((m) => m.id)).toEqual(['m-0', 'm-1']);
    expect('entries' in (back[1] ?? {})).toBe(false);
    expect(loadThread('p2', s)).toEqual([]);
  });

  it('keeps only the last KEEP messages and clears the key for an empty thread', () => {
    const s = memory();
    saveThread(
      'p',
      Array.from({ length: KEEP + 10 }, (_, i) => msg(i)),
      s,
    );
    const back = loadThread('p', s);
    expect(back.length).toBe(KEEP);
    expect(back[0]?.id).toBe('m-10');
    saveThread('p', [], s);
    expect(s.m.size).toBe(0);
  });

  it('shows a plan cut off by the reload as stopped, and ignores corrupt or missing storage', () => {
    const s = memory();
    saveThread('p', [msg(1, { planState: 'applying' })], s);
    expect(loadThread('p', s)[0]?.planState).toBe('stopped');
    s.setItem('mp:pip:bad', '{nope');
    expect(loadThread('bad', s)).toEqual([]);
    s.setItem('mp:pip:shape', JSON.stringify([{ id: 1 }]));
    expect(loadThread('shape', s)).toEqual([]);
    expect(loadThread('p', null)).toEqual([]);
    const full = {
      ...memory(),
      setItem: () => {
        throw new Error('quota');
      },
    };
    expect(() => saveThread('p', [msg(0)], full)).not.toThrow();
  });
});
