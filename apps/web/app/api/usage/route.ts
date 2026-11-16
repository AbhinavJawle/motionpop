import { UsageBatchSchema } from '@motionpop/schemas';
import { parseJsonBody } from '@/lib/credits/parse-body.server';
import { adminDb } from '@/lib/firebase/admin.server';
import { serverConfig } from '@/lib/firebase/server-config.server';
import { errorResponse, verifyRequest } from '@/lib/firebase/verify.server';
import { writeUsage } from '@/lib/usage/usage.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `POST /api/usage` (spec 13 R7.1): the browser's batched router usage events. Clients cannot
 * write `users/{uid}/usage` themselves (rules), so this route stores them with a server time,
 * at most `usageEventsPerDay` per user per UTC day, and keeps the day counters Settings reads.
 * Answers `{ written, dropped }`; 400 for a bad batch, 401 for bad credentials.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    const caller = await verifyRequest(req);
    const batch = await parseJsonBody(req, UsageBatchSchema);
    return Response.json(await writeUsage(adminDb(), caller.uid, batch, await serverConfig()));
  } catch (err) {
    return errorResponse(err);
  }
}
