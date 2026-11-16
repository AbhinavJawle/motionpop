import { SpendRequestSchema } from '@motionpop/schemas';
import { parseJsonBody } from '@/lib/credits/parse-body.server';
import { spendForCaller } from '@/lib/credits/ledger.server';
import { errorResponse, verifyRequest } from '@/lib/firebase/verify.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `POST /api/credits/spend` (spec 13): charge a cloud AI action before the browser makes the call.
 * Verifies the caller (ID token + App Check), computes the price on the server from the action
 * and units, and runs the shared ledger transaction. Refusals (`insufficient`, `rate-limit`,
 * `paused`, `key-used`) are 200 answers with `ok: false`; 400 bad body, 401 bad credentials,
 * 409 the user doc does not exist yet (run bootstrap, then try again).
 */
export async function POST(req: Request): Promise<Response> {
  try {
    const caller = await verifyRequest(req);
    const body = await parseJsonBody(req, SpendRequestSchema);
    return Response.json(await spendForCaller(caller.uid, body));
  } catch (err) {
    return errorResponse(err);
  }
}
