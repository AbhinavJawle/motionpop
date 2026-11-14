import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { demoProject } from '../projects/fixture';
import { IdbProjectRepository } from '../projects/idb-repository';
import { IdbAudioStore, isIdbAudioRef, MemoryAudioStore, type AudioStore } from './audio-store';

const stores: Array<[string, () => AudioStore]> = [
  ['memory', () => new MemoryAudioStore()],
  ['indexeddb', () => new IdbAudioStore(new IDBFactory())],
];

describe.each(stores)('%s audio store', (_name, make) => {
  it('round-trips bytes and type, and deletes', async () => {
    const store = make();
    const ref = await store.put(new Blob([new Uint8Array([1, 2, 3, 250])], { type: 'audio/wav' }));
    expect(isIdbAudioRef(ref)).toBe(true);
    const back = await store.get(ref);
    expect(back?.type).toBe('audio/wav');
    expect([...new Uint8Array(await back!.arrayBuffer())]).toEqual([1, 2, 3, 250]);
    await store.delete(ref);
    expect(await store.get(ref)).toBeNull();
  });

  it('returns null for unknown or foreign refs', async () => {
    const store = make();
    expect(await store.get('idb:audio-nope')).toBeNull();
    expect(await store.get('synth:demo')).toBeNull();
    await expect(store.delete('synth:demo')).resolves.toBeUndefined();
  });
});

describe('shared database', () => {
  it('projects and audio live side by side in one database (v2)', async () => {
    const factory = new IDBFactory();
    const audio = new IdbAudioStore(factory);
    const repo = new IdbProjectRepository(factory);
    const ref = await audio.put(new Blob([new Uint8Array([9])], { type: 'audio/wav' }));
    await repo.save(demoProject());
    expect((await repo.load('demo')).ok).toBe(true);
    expect(await audio.get(ref)).not.toBeNull();
  });
});
