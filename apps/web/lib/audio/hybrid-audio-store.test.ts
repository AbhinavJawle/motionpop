// @vitest-environment happy-dom
import { mediaClipPathFor, videoPathFor, voicePathFor } from '@motionpop/schemas';
import { fixtureProject } from '@motionpop/motion/testing/project-fixture';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { resolveVoiceBlob, uploadVideo, uploadVoice } from '../renders/voice-upload';
import { IdbAudioStore, isIdbAudioRef } from './audio-store';
import {
  AudioElsewhereError,
  HybridAudioStore,
  IdbUploadQueue,
  isStorageAudioRef,
  storagePathOf,
  type RemoteAudio,
} from './hybrid-audio-store';

/** A fake Storage bucket: objects by path, counters, and switches for failures. */
class FakeRemote implements RemoteAudio {
  readonly objects = new Map<string, Blob>();
  uploads = 0;
  downloads = 0;
  failUploads = 0;
  refuseReads = false;
  gate: Promise<void> | null = null;
  started = 0;
  async exists(path: string) {
    return this.objects.has(path);
  }
  async upload(path: string, blob: Blob) {
    this.started += 1;
    if (this.gate) await this.gate;
    if (this.failUploads > 0) {
      this.failUploads -= 1;
      throw new Error('storage/retry-limit-exceeded');
    }
    this.uploads += 1;
    this.objects.set(path, blob);
  }
  async download(path: string) {
    if (this.refuseReads) throw new Error('CORS');
    const b = this.objects.get(path);
    if (!b) throw new Error('storage/object-not-found');
    this.downloads += 1;
    return b;
  }
  async remove(path: string) {
    this.objects.delete(path);
  }
}

function make(
  factory: IDBFactory,
  remote: FakeRemote,
  uid: string | null = 'uid1',
): HybridAudioStore {
  return new HybridAudioStore({
    local: new IdbAudioStore(factory),
    queue: new IdbUploadQueue(factory),
    remote: () => Promise.resolve(remote),
    uid: () => uid,
    delaysMs: [0, 0, 0],
    warn: () => {},
  });
}

const wav = (n: number) => new Blob([new Uint8Array([n, 1, 2, 3])], { type: 'audio/wav' });
const place = { projectId: 'p-1', kind: 'voice' } as const;

describe('HybridAudioStore', () => {
  it('put returns before the upload ends, and the audio plays locally meanwhile', async () => {
    const remote = new FakeRemote();
    let open!: () => void;
    remote.gate = new Promise((r) => (open = r));
    const store = make(new IDBFactory(), remote);

    const ref = await store.put(wav(1), place);
    expect(isStorageAudioRef(ref)).toBe(true);
    expect(remote.objects.size).toBe(0);
    expect(store.pending([ref])).toBe(1);
    expect((await store.get(ref))?.size).toBe(4);

    open();
    await store.drained();
    expect(remote.objects.has(storagePathOf(ref))).toBe(true);
    expect(store.pending([ref])).toBe(0);
  });

  it('a delete during an upload leaves nothing behind (duplicate, then delete at once)', async () => {
    const remote = new FakeRemote();
    let open!: () => void;
    remote.gate = new Promise((r) => (open = r));
    const store = make(new IDBFactory(), remote);
    const ref = await store.put(wav(5), place);
    while (remote.started === 0) await new Promise((r) => setTimeout(r, 1));
    const deleting = store.delete(ref);
    // Let the delete do everything it can before the upload lands.
    await new Promise((r) => setTimeout(r, 30));
    open();
    await deleting;
    await store.drained();
    expect(remote.objects.size).toBe(0);
  });

  it('files the object at the path spec 08 accepts (voicePathFor)', async () => {
    const store = make(new IDBFactory(), new FakeRemote());
    const ref = await store.put(wav(2), place);
    expect(voicePathFor('uid1', 'p-1').test(storagePathOf(ref))).toBe(true);
  });

  it('a failed upload retries in the session', async () => {
    const remote = new FakeRemote();
    remote.failUploads = 2;
    const store = make(new IDBFactory(), remote);
    const ref = await store.put(wav(3), place);
    await store.drained();
    expect(remote.objects.has(storagePathOf(ref))).toBe(true);
    expect(store.uploadStatus().failing.size).toBe(0);
  });

  it('an upload that keeps failing survives a new store instance and finishes there', async () => {
    const factory = new IDBFactory();
    const down = new FakeRemote();
    down.failUploads = 99;
    const first = make(factory, down);
    const ref = await first.put(wav(4), place);
    await first.drained();
    expect(down.objects.size).toBe(0);
    expect(first.uploadStatus().failing.has(ref)).toBe(true);

    // A reload: new store, same IndexedDB, Storage reachable again.
    const up = new FakeRemote();
    const second = make(factory, up);
    await second.resume();
    await second.drained();
    expect(up.objects.has(storagePathOf(ref))).toBe(true);
    expect(second.pending()).toBe(0);
  });

  it('get falls back to Storage and caches the blob locally', async () => {
    const remote = new FakeRemote();
    const recorder = make(new IDBFactory(), remote);
    const ref = await recorder.put(wav(5), place);
    await recorder.drained();
    expect(remote.objects.size).toBe(1);

    const otherDevice = make(new IDBFactory(), remote);
    expect((await otherDevice.get(ref))?.size).toBe(4);
    expect((await otherDevice.get(ref))?.size).toBe(4);
    expect(remote.downloads).toBe(1);
  });

  it('a refused read with no local copy says the voice lives on another device', async () => {
    const remote = new FakeRemote();
    const ref = await make(new IDBFactory(), remote).put(wav(6), place);
    remote.refuseReads = true;
    await expect(make(new IDBFactory(), remote).get(ref)).rejects.toBeInstanceOf(
      AudioElsewhereError,
    );
  });

  it('the same bytes twice give one object and one upload', async () => {
    const remote = new FakeRemote();
    const store = make(new IDBFactory(), remote);
    const a = await store.put(wav(7), place);
    const b = await store.put(wav(7), place);
    await store.drained();
    expect(a).toBe(b);
    expect(remote.objects.size).toBe(1);
    expect(remote.uploads).toBe(1);
  });

  it('signed out (or with no place) keeps idb: refs, as in local mode', async () => {
    const remote = new FakeRemote();
    const out = make(new IDBFactory(), remote, null);
    expect(isIdbAudioRef(await out.put(wav(8), place))).toBe(true);
    expect(isIdbAudioRef(await make(new IDBFactory(), remote).put(wav(8)))).toBe(true);
    await out.drained();
    expect(remote.uploads).toBe(0);
  });

  it('export seam: once the editor upload finished, the export path uploads nothing', async () => {
    const remote = new FakeRemote();
    const store = make(new IDBFactory(), remote);
    const ref = await store.put(wav(9), place);
    await store.drained();
    expect(remote.uploads).toBe(1);

    const base = fixtureProject();
    const project = { ...base, id: 'p-1', voiceover: { ...base.voiceover, src: ref } };
    const blob = await resolveVoiceBlob(project, store);
    const path = await uploadVoice('uid1', 'p-1', blob, () => Promise.resolve(remote));
    expect(path).toBe(storagePathOf(ref));
    expect(remote.uploads).toBe(1);
  });

  it('syncs source videos under users/{uid}/video/{projectId}/source-… and downloads on another device', async () => {
    const remote = new FakeRemote();
    const mp4 = new Blob([new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112])], {
      type: 'video/mp4',
    });
    const laptopA = make(new IDBFactory(), remote);
    const ref = await laptopA.put(mp4, { projectId: 'p-vid', kind: 'source' });
    expect(isStorageAudioRef(ref)).toBe(true);
    expect(videoPathFor('uid1', 'p-vid').test(storagePathOf(ref))).toBe(true);
    await laptopA.drained();
    expect(remote.uploads).toBe(1);

    // Another device with an empty IndexedDB downloads and caches the video from Storage.
    const laptopB = make(new IDBFactory(), remote);
    expect((await laptopB.get(ref))?.size).toBe(8);
    expect((await laptopB.get(ref))?.size).toBe(8);
    expect(remote.downloads).toBe(1);

    // Export reuses the already-uploaded object at the identical content-hashed path.
    const exportPath = await uploadVideo('uid1', 'p-vid', mp4, () => Promise.resolve(remote));
    expect(exportPath).toBe(storagePathOf(ref));
    expect(remote.uploads).toBe(1);
  });

  it('infers video extension from File.name when MIME type is empty and syncs Media Bin clips', async () => {
    const remote = new FakeRemote();
    const store = make(new IDBFactory(), remote);
    const movFile = new File([new Uint8Array([1, 2, 3, 4])], 'talking-head.MOV', { type: '' });
    const sourceRef = await store.put(movFile, { projectId: 'p-mov', kind: 'source' });
    expect(isStorageAudioRef(sourceRef)).toBe(true);
    expect(videoPathFor('uid1', 'p-mov').test(storagePathOf(sourceRef))).toBe(true);
    expect(storagePathOf(sourceRef).endsWith('.mov')).toBe(true);

    const imgClip = new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' });
    const clipRef = await store.put(imgClip, { projectId: 'p-mov', kind: 'clip' });
    expect(isStorageAudioRef(clipRef)).toBe(true);
    expect(mediaClipPathFor('uid1', 'p-mov').test(storagePathOf(clipRef))).toBe(true);

    await store.drained();
    expect(remote.uploads).toBe(2);
  });
});
