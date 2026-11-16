import { getStorageClient } from '../firebase/client';
import type { RemoteAudio } from './hybrid-audio-store';

const notFound = (e: unknown): boolean =>
  typeof e === 'object' &&
  e !== null &&
  (e as { code?: unknown }).code === 'storage/object-not-found';

/** The real `RemoteAudio`: Firebase Storage through the web SDK (owner-only rules). */
export async function firebaseRemoteAudio(): Promise<RemoteAudio> {
  const storage = await getStorageClient();
  const { deleteObject, getBlob, getMetadata, ref, uploadBytes } = await import('firebase/storage');
  return {
    async exists(path) {
      try {
        await getMetadata(ref(storage, path));
        return true;
      } catch (e) {
        if (notFound(e)) return false;
        throw e;
      }
    },
    async upload(path, blob, contentType) {
      await uploadBytes(ref(storage, path), blob, { contentType });
    },
    // Needs a CORS rule on the bucket for the app's origins (design §2.4, open question 5).
    download: (path) => getBlob(ref(storage, path)),
    async remove(path) {
      try {
        await deleteObject(ref(storage, path));
      } catch (e) {
        if (!notFound(e)) throw e;
      }
    },
  };
}
