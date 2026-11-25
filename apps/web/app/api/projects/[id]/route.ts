import { ACTIVE_RENDER_STATUSES } from '@motionpop/schemas';
import { adminDb } from '@/lib/firebase/admin.server';
import { errorResponse, verifyRequest } from '@/lib/firebase/verify.server';
import { deleteProject, type DeleteProjectDeps } from '@/lib/projects/delete-project.server';
import { bucket } from '@/lib/renders/storage.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function adminDeps(): DeleteProjectDeps {
  const db = adminDb();
  const ref = (id: string) => db.collection('projects').doc(id);
  return {
    async ownerOf(id) {
      const snap = await ref(id).get();
      const owner = snap.exists ? (snap.get('ownerId') as unknown) : null;
      return typeof owner === 'string' ? owner : snap.exists ? '' : null;
    },
    async hasActiveRender(uid, id) {
      const snap = await db
        .collection('renders')
        .where('ownerId', '==', uid)
        .where('projectId', '==', id)
        .get();
      return snap.docs.some((d) =>
        (ACTIVE_RENDER_STATUSES as readonly string[]).includes(String(d.get('status') ?? '')),
      );
    },
    async deleteSubCollections(id) {
      for (const sub of await ref(id).listCollections()) await db.recursiveDelete(sub);
    },
    async deleteRelated(uid, id) {
      for (const name of ['renders', 'shares']) {
        const snap = await db
          .collection(name)
          .where('ownerId', '==', uid)
          .where('projectId', '==', id)
          .get();
        await Promise.all(snap.docs.map((d) => d.ref.delete()));
      }
    },
    async deletePrefix(prefix) {
      await bucket().deleteFiles({ prefix, force: true });
    },
    async deleteProjectDoc(id) {
      await ref(id).delete();
    },
  };
}

/** `DELETE /api/projects/{id}`: the owner deletes a project and everything under it. */
export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const caller = await verifyRequest(req);
    const { id } = await ctx.params;
    return Response.json(await deleteProject(adminDeps(), caller.uid, id));
  } catch (err) {
    return errorResponse(err);
  }
}
