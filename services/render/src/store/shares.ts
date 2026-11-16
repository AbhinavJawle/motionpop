// Share links (spec 08 design §3 step 7, R5.3, R5.4): one unguessable share doc per render, made
// once and reused. The share page reads through `loadShare` with the Admin SDK; clients can't read
// `shares/**` at all (rules).
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { RenderDocSchema, ShareDocSchema, isSafeId, type RenderDoc } from '@motionpop/schemas';
import { newShareId } from './ids';

export type CreateShareResult =
  /** The share id, and whether this call made it (a repeat returns the same one). */
  | { kind: 'ok'; shareId: string; created: boolean }
  /** No such render, or it is not the caller's: the same answer, so existence doesn't leak. */
  | { kind: 'not-found' }
  /** The render exists but has no video yet. */
  | { kind: 'not-done' };

/**
 * In one transaction: the render must be the caller's and `done`. It reuses `render.shareId` while
 * the share exists and is not revoked, otherwise it creates `shares/{id}` and stores the id on
 * the render. Concurrent calls serialise on the render doc, so one render never gets two shares.
 */
export function createShare(
  db: Firestore,
  renderId: string,
  ownerId: string,
  makeId: () => string = newShareId,
): Promise<CreateShareResult> {
  if (!isSafeId(renderId)) return Promise.resolve({ kind: 'not-found' });
  return db.runTransaction(async (t) => {
    const renderRef = db.doc(`renders/${renderId}`);
    const snap = await t.get(renderRef);
    if (!snap.exists) return { kind: 'not-found' };
    const render = RenderDocSchema.parse(snap.data());
    if (render.ownerId !== ownerId) return { kind: 'not-found' };
    if (render.status !== 'done') return { kind: 'not-done' };
    if (render.shareId) {
      const existing = await t.get(db.doc(`shares/${render.shareId}`));
      if (existing.exists && !ShareDocSchema.parse(existing.data()).revoked) {
        return { kind: 'ok', shareId: render.shareId, created: false };
      }
    }
    const shareId = makeId();
    t.create(db.doc(`shares/${shareId}`), {
      schemaVersion: 1,
      ownerId,
      projectId: render.projectId,
      renderId,
      revoked: false,
      createdAt: FieldValue.serverTimestamp(),
    });
    t.update(renderRef, { shareId });
    return { kind: 'ok', shareId, created: true };
  });
}

/** What the share page shows: a share that is live and a finished render. */
export interface LoadedShare {
  shareId: string;
  renderId: string;
  render: RenderDoc;
}

const SHARE_ID = /^[A-Za-z0-9_-]{22}$/;

/** The share and its render, or null when either is missing, revoked or not finished. */
export async function loadShare(db: Firestore, shareId: string): Promise<LoadedShare | null> {
  if (!SHARE_ID.test(shareId)) return null;
  const shareSnap = await db.doc(`shares/${shareId}`).get();
  if (!shareSnap.exists) return null;
  const share = ShareDocSchema.safeParse(shareSnap.data());
  if (!share.success || share.data.revoked) return null;
  const renderSnap = await db.doc(`renders/${share.data.renderId}`).get();
  if (!renderSnap.exists) return null;
  const render = RenderDocSchema.safeParse(renderSnap.data());
  if (!render.success || render.data.status !== 'done' || !render.data.outputPath) return null;
  if (render.data.ownerId !== share.data.ownerId) return null;
  return { shareId, renderId: share.data.renderId, render: render.data };
}
