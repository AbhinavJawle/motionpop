import 'server-only';
import { HttpError } from '@/lib/firebase/verify.server';

/**
 * `DELETE /api/projects/{id}` (spec 11 task 6b, R1.6). Every step is idempotent and the project
 * document goes last, so a delete that fails halfway is simply retried. Ledger entries stay: they
 * are history.
 */
export interface DeleteProjectDeps {
  /** `projects/{id}.ownerId`, or null when the document doesn't exist. */
  ownerOf(id: string): Promise<string | null>;
  /** True when the project currently has a queued/rendering/encoding export (prevents orphaned artifacts & lost refunds). */
  hasActiveRender?(uid: string, id: string): Promise<boolean>;
  /** Every sub-collection of the project (transcript, slots, versions, chat, later ones). */
  deleteSubCollections(id: string): Promise<void>;
  /** The caller's `renders` and `shares` documents of this project. */
  deleteRelated(uid: string, id: string): Promise<void>;
  /** Storage objects under the given prefix. */
  deletePrefix(prefix: string): Promise<void>;
  deleteProjectDoc(id: string): Promise<void>;
}

export async function deleteProject(
  deps: DeleteProjectDeps,
  uid: string,
  id: string,
): Promise<{ deleted: true }> {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new HttpError(400, 'bad project id');
  const owner = await deps.ownerOf(id);
  // Already gone: deleting again is a success (a retry after a half-finished delete).
  if (owner === null) return { deleted: true };
  if (owner !== uid) throw new HttpError(403, 'not your project');
  if (deps.hasActiveRender && (await deps.hasActiveRender(uid, id))) {
    throw new HttpError(409, 'Cannot delete project while an export is in progress');
  }
  await deps.deleteSubCollections(id);
  await deps.deleteRelated(uid, id);
  await deps.deletePrefix(`users/${uid}/audio/${id}/`);
  await deps.deletePrefix(`users/${uid}/video/${id}/`);
  await deps.deletePrefix(`users/${uid}/projects/${id}/`);
  await deps.deleteProjectDoc(id);
  return { deleted: true };
}
