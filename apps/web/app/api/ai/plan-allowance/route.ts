import { adminDb } from '@/lib/firebase/admin.server';
import { serverConfig } from '@/lib/firebase/server-config.server';
import { errorResponse, verifyRequest } from '@/lib/firebase/verify.server';
import type { PlanAllowanceResponse } from '@/lib/ai/plan-allowance-logic';
import { takePlanAllowance } from '@/lib/ai/plan-allowance.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `POST /api/ai/plan-allowance` (spec 07 design, AI flow 2): asked by the client before a free
 * cloud `direct.plan` call. Verifies the caller (ID token + App Check), then counts the call
 * against today's (UTC) `planFreeCloudPerDay` from the server config. Answers
 * `{ allowed: true, used, limit }` or `{ allowed: false, reason: 'limit', used, limit }`.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    const caller = await verifyRequest(req);
    const { planFreeCloudPerDay } = await serverConfig();
    const body: PlanAllowanceResponse = await takePlanAllowance(
      adminDb(),
      caller.uid,
      planFreeCloudPerDay,
      Date.now(),
    );
    return Response.json(body);
  } catch (err) {
    return errorResponse(err);
  }
}
