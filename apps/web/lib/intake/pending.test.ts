import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { IdbAudioStore } from '../audio/audio-store';
import {
  clearPending,
  readDraft,
  setPending,
  takePending,
  writeDraft,
  type PendingDeps,
} from './pending';

/** A `sessionStorage` stand-in that survives "reloads" (new deps objects over the same map). */
function memoryStorage(map = new Map<string, string>()): PendingDeps['storage'] {
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

const take = (b: number) => new Blob([new Uint8Array([b, b])], { type: 'audio/wav' });
const meta = { source: 'record' as const, name: 'Recording', cleanup: true };

describe('pending intake', () => {
  it('a take survives a reload: new store instances resolve the same bytes', async () => {
    const factory = new IDBFactory();
    const session = new Map<string, string>();
    const before: PendingDeps = {
      storage: memoryStorage(session),
      audio: new IdbAudioStore(factory),
    };
    await setPending(take(7), meta, { title: 'Take one', format: '1:1' }, before);

    const after: PendingDeps = {
      storage: memoryStorage(session),
      audio: new IdbAudioStore(factory),
    };
    const p = await takePending(after);
    expect(p?.meta).toMatchObject(meta);
    expect(p?.draft).toEqual({ title: 'Take one', format: '1:1' });
    expect([...new Uint8Array(await p!.blob!.arrayBuffer())]).toEqual([7, 7]);
  });

  it('a newer hand-off deletes the older take; clearing keeps or deletes the audio as asked', async () => {
    const audio = new IdbAudioStore(new IDBFactory());
    const deps: PendingDeps = { storage: memoryStorage(), audio };
    const first = await setPending(take(1), meta, undefined, deps);
    const second = await setPending(take(2), meta, undefined, deps);
    expect(await audio.get(first)).toBeNull();

    await clearPending({ keepAudio: true }, deps);
    expect(await takePending(deps)).toBeNull();
    expect(await audio.get(second)).not.toBeNull();

    const third = await setPending(take(3), meta, undefined, deps);
    await clearPending({ keepAudio: false }, deps);
    expect(await audio.get(third)).toBeNull();
  });

  it('a bad stored draft falls back to the defaults', () => {
    const storage = memoryStorage(new Map([['mp:start-draft', '{"format":"4:3"}']]));
    expect(readDraft({ storage })).toEqual({ title: 'Untitled Project', format: '16:9' });
    expect(writeDraft({ format: '9:16' }, { storage })).toEqual({
      title: 'Untitled Project',
      format: '9:16',
    });
  });
});
