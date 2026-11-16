import { authSettled, currentUid } from '../auth/auth-store';
import { firebaseEnabled } from '../firebase/client';
import { IdbAudioStore, MemoryAudioStore } from './audio-store';
import { firebaseRemoteAudio } from './firebase-remote-audio';
import {
  HybridAudioStore,
  IdbUploadQueue,
  MemoryUploadQueue,
  type RemoteAudio,
} from './hybrid-audio-store';

let shared: HybridAudioStore | undefined;

/**
 * The app's audio store (spec 11 task 7): IndexedDB first, mirrored to the account's Storage
 * when signed in. Local mode and signed-out use keep `idb:` refs exactly as before.
 */
export function appAudioStore(): HybridAudioStore {
  if (shared) return shared;
  const browser = typeof indexedDB !== 'undefined';
  const enabled = browser && firebaseEnabled();
  let remote: Promise<RemoteAudio> | undefined;
  shared = new HybridAudioStore({
    local: browser ? new IdbAudioStore() : new MemoryAudioStore(),
    queue: browser ? new IdbUploadQueue() : new MemoryUploadQueue(),
    remote: () => (remote ??= firebaseRemoteAudio()),
    uid: () => (enabled ? currentUid() : null),
  });
  // Uploads left over from an earlier visit start once sign-in is known.
  if (enabled) {
    const store = shared;
    void authSettled().then(() => store.resume().catch(() => undefined));
  }
  return shared;
}
