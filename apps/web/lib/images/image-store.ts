import { mediaHashOf, mediaRef, mediaStoragePath } from '@motionpop/schemas';
import { IdbAudioStore, MemoryAudioStore, type KeyedBlobs } from '../audio/audio-store';
import { currentUid } from '../auth/auth-store';
import { firebaseEnabled, getStorageClient } from '../firebase/client';

/**
 * Where images live (spec 07 R4): the bytes in this browser's IndexedDB (the app's blob store,
 * shared with audio), mirrored to `users/{uid}/media/{hash}.webp` when signed in, so the export
 * job and other devices can read them. Refs are `media:{hash}.webp`; the hash is the asset's
 * identity, so the same picture is stored once however many slots use it.
 */
let local: KeyedBlobs | undefined;
const blobs = (): KeyedBlobs =>
  (local ??= typeof indexedDB !== 'undefined' ? new IdbAudioStore() : new MemoryAudioStore());
const keyOf = (hash: string) => `media-${hash}`;

async function storage() {
  const s = await getStorageClient();
  const api = await import('firebase/storage');
  return { s, ...api };
}

/** Store the bytes; resolves once local, uploads in the background when signed in. */
export async function putImage(hash: string, blob: Blob): Promise<string> {
  await blobs().putKey(keyOf(hash), blob);
  urls.delete(mediaRef(hash));
  const uid = firebaseEnabled() ? currentUid() : null;
  if (uid) {
    void storage()
      .then(({ s, ref, uploadBytes }) =>
        uploadBytes(ref(s, mediaStoragePath(uid, hash)), blob, { contentType: 'image/webp' }),
      )
      .catch((e: unknown) => console.warn('Image upload failed; it stays in this browser', e));
  }
  return mediaRef(hash);
}

/** Make sure the account has the bytes (the export reads them from Storage). */
export async function ensureUploaded(ref: string): Promise<boolean> {
  const hash = mediaHashOf(ref);
  const uid = firebaseEnabled() ? currentUid() : null;
  if (!hash || !uid) return false;
  const { s, ref: sref, getMetadata, uploadBytes } = await storage();
  const path = mediaStoragePath(uid, hash);
  try {
    await getMetadata(sref(s, path));
    return true;
  } catch {
    const blob = await blobs().getKey(keyOf(hash));
    if (!blob) return false;
    await uploadBytes(sref(s, path), blob, { contentType: 'image/webp' });
    return true;
  }
}

export async function getImage(ref: string): Promise<Blob | null> {
  const hash = mediaHashOf(ref);
  if (!hash) return null;
  const hit = await blobs().getKey(keyOf(hash));
  if (hit) return hit;
  const uid = firebaseEnabled() ? currentUid() : null;
  if (!uid) return null;
  try {
    const { s, ref: sref, getBlob } = await storage();
    const blob = await getBlob(sref(s, mediaStoragePath(uid, hash)));
    await blobs().putKey(keyOf(hash), blob);
    return blob;
  } catch {
    return null;
  }
}

const urls = new Map<string, Promise<string | null>>();

function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error('read failed'));
    r.readAsDataURL(blob);
  });
}

/**
 * A data URL for the preview: the composition runs in a sandboxed iframe that can't read the
 * app's blob URLs, so the bytes go inline. Cached per ref.
 */
export function imageDataUrl(ref: string): Promise<string | null> {
  let p = urls.get(ref);
  if (!p) {
    p = getImage(ref).then((b) => (b ? toDataUrl(b) : null));
    p.catch(() => urls.delete(ref));
    urls.set(ref, p);
  }
  return p;
}
