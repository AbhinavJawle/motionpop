import { getDb } from '../firebase/client';
import { createUserStore, type UserDocListen } from './user-store';

/** The real listener: `onSnapshot(users/{uid})`, imported on demand. */
export const listenUserDoc: UserDocListen = (uid, onData, onError) => {
  let stop: (() => void) | undefined;
  let cancelled = false;
  void (async () => {
    try {
      const db = await getDb();
      const { doc, onSnapshot } = await import('firebase/firestore');
      if (cancelled) return;
      stop = onSnapshot(
        doc(db, 'users', uid),
        (snap) => onData(snap.exists() ? snap.data() : undefined),
        onError,
      );
    } catch (err) {
      onError(err);
    }
  })();
  return () => {
    cancelled = true;
    stop?.();
  };
};

/** The app-wide store (one listener per uid, however many components read it). */
export const userStore = createUserStore(listenUserDoc);
