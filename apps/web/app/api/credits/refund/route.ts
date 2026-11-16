import { RefundRequestSchema } from '@motionpop/schemas';
import { parseJsonBody } from '@/lib/credits/parse-body.server';
import { refundForCaller } from '@/lib/credits/ledger.server';
import { errorResponse, verifyRequest } from '@/lib/firebase/verify.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `POST /api/credits/refund` (spec 13): give back one of the caller's own AI spends (`s-{key}`
 * ids only, at most 15 minutes old, at most `refundsPerDay` a day). An id that is not an `s-`
 * id, such as an `export-*` entry, fails the request schema (400). Refusals are 200 with
 * `ok: false`.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    const caller = await verifyRequest(req);
    const body = await parseJsonBody(req, RefundRequestSchema);
    return Response.json(await refundForCaller(caller.uid, body.txId));
  } catch (err) {
    return errorResponse(err);
  }
}
