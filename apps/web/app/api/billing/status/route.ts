import { readPurchaseStatus } from '@motionpop/render/store';
import { BillingStatusResponseSchema, DodoResourceIdSchema } from '@motionpop/schemas';
import { adminDb } from '@/lib/firebase/admin.server';
import { HttpError, errorResponse, verifyRequest } from '@/lib/firebase/verify.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `GET /api/billing/status?payment_id=...` (spec 44): read-only check of whether a verified
 * Dodo webhook has settled credits for the signed-in caller's payment. Never mutates credits.
 */
export async function GET(req: Request): Promise<Response> {
  try {
    const caller = await verifyRequest(req);
    const url = new URL(req.url);
    const rawId = url.searchParams.get('payment_id') ?? '';
    const parsedId = DodoResourceIdSchema.safeParse(rawId);
    if (!parsedId.success) {
      throw new HttpError(400, 'Invalid payment_id');
    }
    const status = await readPurchaseStatus(adminDb(), caller.uid, parsedId.data);
    return Response.json(BillingStatusResponseSchema.parse(status), {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
