import type { UnwrapWebhookEvent } from 'dodopayments/resources/webhooks';
import {
  createDodoClient,
  handleDodoWebhookEvent,
  readBillingConfig,
} from '@/lib/billing/dodo.server';
import { adminDb } from '@/lib/firebase/admin.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `POST /api/webhooks/dodopayments` (spec 44): receives Standard Webhooks signed events from
 * Dodo Payments, verifies signatures on the exact raw body via `client.webhooks.unwrap`, and
 * applies credit grants/reversals/restores atomically inside Firestore transactions.
 *
 * Returns:
 * - 503 if webhook secret or API key is not configured
 * - 401 if Standard Webhooks signature or timestamp verification fails
 * - 200 `{ received: true }` ONLY after Firestore commit
 * - 500 on transient storage failures so Dodo retries safely
 */
export async function POST(req: Request): Promise<Response> {
  const cfg = readBillingConfig();
  if (!cfg.webhookKey || !cfg.apiKey) {
    return Response.json({ error: 'Webhook endpoint is not configured' }, { status: 503 });
  }

  let client;
  try {
    client = createDodoClient(cfg);
  } catch (err) {
    console.error('[billing] Dodo client config error', err);
    return Response.json({ error: 'Billing configuration mismatch' }, { status: 503 });
  }

  const rawBody = await req.text();
  const webhookId = req.headers.get('webhook-id') ?? '';
  const webhookSignature = req.headers.get('webhook-signature') ?? '';
  const webhookTimestamp = req.headers.get('webhook-timestamp') ?? '';

  if (!webhookId || !webhookSignature || !webhookTimestamp) {
    return Response.json({ error: 'Missing webhook signature headers' }, { status: 401 });
  }

  let event: UnwrapWebhookEvent;
  try {
    event = client.webhooks.unwrap(rawBody, {
      headers: {
        'webhook-id': webhookId,
        'webhook-signature': webhookSignature,
        'webhook-timestamp': webhookTimestamp,
      },
    });
  } catch {
    return Response.json({ error: 'Invalid webhook signature' }, { status: 401 });
  }

  try {
    const outcome = await handleDodoWebhookEvent(
      {
        db: adminDb(),
        cfg,
        retrievePayment: (id) => client.payments.retrieve(id),
        retrieveLineItems: (id) => client.payments.retrieveLineItems(id),
      },
      event,
      webhookId,
    );
    return Response.json({ received: true, action: outcome.action });
  } catch (err) {
    console.error('[billing] Webhook processing failed', { webhookId, type: event.type, err });
    return Response.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
