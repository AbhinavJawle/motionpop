import { CheckoutRequestSchema, CheckoutResponseSchema, UserDocSchema } from '@motionpop/schemas';
import {
  createDodoClient,
  isPackConfigured,
  readBillingConfig,
  resolveReturnUrl,
} from '@/lib/billing/dodo.server';
import { parseJsonBody } from '@/lib/credits/parse-body.server';
import { adminDb } from '@/lib/firebase/admin.server';
import { serverConfig } from '@/lib/firebase/server-config.server';
import { HttpError, errorResponse, verifyRequest } from '@/lib/firebase/verify.server';
import { parseJudgeEmails } from '@/lib/users/bootstrap-plan';
import { bootstrapUser } from '@/lib/users/bootstrap.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Lightweight per-instance abuse guard: at most 10 checkout sessions per user per minute.
const recentByUid = new Map<string, number[]>();
function allowCheckout(uid: string): boolean {
  const now = Date.now();
  const list = (recentByUid.get(uid) ?? []).filter((t) => now - t < 60_000);
  if (list.length >= 10) return false;
  list.push(now);
  recentByUid.set(uid, list);
  return true;
}

/**
 * `POST /api/billing/checkout` (spec 44): creates a single-use Dodo Payments Checkout Session
 * for an authenticated Firebase caller.
 *
 * Security:
 * - Verifies Firebase ID token + App Check via `verifyRequest`.
 * - Rate-limits checkout creation per UID.
 * - Accepts only `{ packId, quantity }` (never raw `product_id` or price).
 * - Maps `packId` server-side to an allowlisted Dodo product ID and attaches `metadata.app_user_id`.
 * - Reuses `dodoCustomerId` only when it matches the active Dodo environment (`test_mode` vs `live_mode`).
 * - Returns only `{ checkoutUrl, sessionId, environment }`.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    const caller = await verifyRequest(req);
    if (!allowCheckout(caller.uid)) {
      throw new HttpError(429, 'Too many checkout attempts. Please wait a minute and try again.');
    }
    const body = await parseJsonBody(req, CheckoutRequestSchema);
    const cfg = readBillingConfig();

    if (!isPackConfigured(cfg, body.packId)) {
      throw new HttpError(
        503,
        'Credit checkout is not enabled on this environment yet. Check Dodo Payments configuration.',
      );
    }
    const productId = cfg.productIds[body.packId];
    if (!productId) {
      throw new HttpError(503, 'This credit pack is not configured yet.');
    }

    const db = adminDb();
    // Ensure the user doc exists before checkout so the webhook transaction always finds it.
    await bootstrapUser(
      db,
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

    const userSnap = await db.collection('users').doc(caller.uid).get();
    const userDoc = userSnap.exists ? UserDocSchema.safeParse(userSnap.data()) : null;
    // Customers never cross between Dodo test_mode and live_mode: reuse customer_id only if the mode matches.
    const existingCustomerId =
      userDoc?.success && userDoc.data.dodoCustomerEnv === cfg.environment
        ? userDoc.data.dodoCustomerId
        : undefined;

    const client = createDodoClient(cfg);
    const emailCustomer = caller.email
      ? {
          email: caller.email,
          ...(caller.name ? { name: caller.name } : {}),
        }
      : undefined;

    const basePayload = {
      product_cart: [{ product_id: productId, quantity: body.quantity }],
      metadata: {
        app_user_id: caller.uid,
        pack_id: body.packId,
      },
      feature_flags: {
        allow_discount_code: true,
        allow_tax_id: true,
      },
      return_url: resolveReturnUrl(cfg, req),
    };

    let session;
    if (existingCustomerId) {
      try {
        session = await client.checkoutSessions.create({
          ...basePayload,
          customer: { customer_id: existingCustomerId },
        });
      } catch {
        // Stale or deleted Dodo customer ID: fall back seamlessly to email lookup.
        session = await client.checkoutSessions.create({
          ...basePayload,
          ...(emailCustomer ? { customer: emailCustomer } : {}),
        });
      }
    } else {
      session = await client.checkoutSessions.create({
        ...basePayload,
        ...(emailCustomer ? { customer: emailCustomer } : {}),
      });
    }

    if (!session.checkout_url) {
      throw new HttpError(502, 'Checkout provider did not return a payment URL.');
    }

    return Response.json(
      CheckoutResponseSchema.parse({
        checkoutUrl: session.checkout_url,
        sessionId: session.session_id,
        environment: cfg.environment,
      }),
    );
  } catch (err) {
    return errorResponse(err);
  }
}
