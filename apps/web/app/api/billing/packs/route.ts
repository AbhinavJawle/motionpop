import { BillingPacksResponseSchema, CREDIT_PACKS } from '@motionpop/schemas';
import { isPackConfigured, readBillingConfig } from '@/lib/billing/dodo.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `GET /api/billing/packs` (spec 44): public, safe read of which credit packs are configured
 * for Dodo Payments checkout and whether billing is in test or live mode. Never exposes keys
 * or raw Dodo product IDs.
 */
export async function GET(): Promise<Response> {
  const cfg = readBillingConfig();
  const packs = CREDIT_PACKS.map((p) => ({
    id: p.id,
    available: isPackConfigured(cfg, p.id),
  }));
  const configured = packs.some((p) => p.available);
  return Response.json(
    BillingPacksResponseSchema.parse({
      configured,
      environment: cfg.environment,
      packs,
    }),
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
