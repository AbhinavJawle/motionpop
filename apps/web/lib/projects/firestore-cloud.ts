import { apiHeaders } from '@/lib/users/bootstrap-client';
import { getAuthClient, getDb } from '@/lib/firebase/client';
import { SUB_COLLECTIONS, type CloudWrite, type SubCollection } from './cloud-docs';
import type { CloudStore } from './synced-library';

/** Firestore allows 500 writes a batch; stay clear of it. */
const BATCH_MAX = 450;

/** The real `CloudStore`: Firestore through the web SDK, delete through the server route. */
export function firestoreCloud(): CloudStore {
  const fs = () => import('firebase/firestore');
  return {
    async readHead(id) {
      const { doc, getDoc } = await fs();
      const snap = await getDoc(doc(await getDb(), 'projects', id));
      return snap.exists() ? snap.data() : null;
    },

    async readSet(id) {
      const { collection, doc, getDoc, getDocs } = await fs();
      const db = await getDb();
      const head = await getDoc(doc(db, 'projects', id));
      if (!head.exists()) return null;
      const entries = await Promise.all(
        SUB_COLLECTIONS.map(async (sub) => {
          const snap = await getDocs(collection(db, 'projects', id, sub));
          return [sub, new Map(snap.docs.map((d) => [d.id, d.data() as unknown]))] as const;
        }),
      );
      return {
        project: head.data(),
        subs: Object.fromEntries(entries) as Record<SubCollection, Map<string, unknown>>,
      };
    },

    async commit(id, writes, opts) {
      const { doc, setDoc, writeBatch } = await fs();
      const db = await getDb();
      const project = writes.find(
        (w): w is Extract<CloudWrite, { op: 'set' }> => w.op === 'set' && w.path === null,
      );
      const rest = writes.filter((w) => w !== project);
      const ref = (w: CloudWrite) =>
        w.path ? doc(db, 'projects', id, w.path.sub, w.path.id) : doc(db, 'projects', id);
      // The rules check sub-documents against the project's owner, so a new project document
      // must exist before the first batch of its sub-documents.
      if (project && rest.length > 0 && opts?.isNew) await setDoc(ref(project), project.data);
      const chunks: CloudWrite[][] = [];
      for (let i = 0; i < rest.length; i += BATCH_MAX) chunks.push(rest.slice(i, i + BATCH_MAX));
      if (chunks.length === 0) chunks.push([]);
      for (const [k, chunk] of chunks.entries()) {
        const batch = writeBatch(db);
        for (const w of chunk) {
          if (w.op === 'set') batch.set(ref(w), w.data);
          else batch.delete(ref(w));
        }
        // The project document rides in the last batch, after every slot it summarises.
        if (project && k === chunks.length - 1) batch.set(ref(project), project.data);
        await batch.commit();
      }
    },

    async listOwned(uid) {
      const { collection, getDocs, limit, query, where } = await fs();
      // No orderBy: the owner filter alone needs no composite index; the library sorts.
      const q = query(
        collection(await getDb(), 'projects'),
        where('ownerId', '==', uid),
        limit(200),
      );
      const snap = await getDocs(q);
      return snap.docs.map((d) => [d.id, d.data() as unknown] as [string, unknown]);
    },

    async remove(id) {
      const auth = await getAuthClient();
      const user = auth.currentUser;
      if (!user) throw new Error('Not signed in');
      const res = await fetch(`/api/projects/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: await apiHeaders(() => user.getIdToken()),
      });
      if (!res.ok) throw new Error(`Delete failed (${res.status})`);
    },

    async touch(id, atMs) {
      const { doc, updateDoc } = await fs();
      await updateDoc(doc(await getDb(), 'projects', id), { lastOpenedAt: atMs });
    },
  };
}
