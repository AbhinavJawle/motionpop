import { adminDb } from '@/lib/firebase/admin.server';
import { serverConfig } from '@/lib/firebase/server-config.server';
import { errorResponse, verifyRequest } from '@/lib/firebase/verify.server';
import { parseJudgeEmails } from '@/lib/users/bootstrap-plan';
import { bootstrapUser } from '@/lib/users/bootstrap.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `POST /api/users/bootstrap` (spec 01 R4.3–R4.5): verify the caller, then create their user doc
 * with the signup grant on first sign-in. Idempotent; safe to call on every sign-in.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    const caller = await verifyRequest(req);
    const result = await bootstrapUser(
      adminDb(),
      caller.uid,
      {
        email: caller.email,
        emailVerified: caller.emailVerified,
        displayName: caller.name,
        photoURL: caller.picture,
      },
      parseJudgeEmails(process.env.JUDGE_EMAILS),
      await serverConfig(),
    );
    return Response.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
