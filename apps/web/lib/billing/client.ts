import {
  BillingPacksResponseSchema,
  BillingStatusResponseSchema,
  CheckoutResponseSchema,
  type BillingPacksResponse,
  type BillingStatusResponse,
  type CheckoutResponse,
  type CreditPackId,
} from '@motionpop/schemas';
import { apiHeaders } from '@/lib/users/bootstrap-client';

/** Client-side helpers for Motionpop's Dodo Payments billing routes (spec 44). */

export async function fetchBillingPacks(fetchImpl: typeof fetch = fetch): Promise<BillingPacksResponse> {
  const res = await fetchImpl('/api/billing/packs', { cache: 'no-store' });
  if (!res.ok) throw new Error(`Couldn't load credit packs (${res.status})`);
  return BillingPacksResponseSchema.parse(await res.json());
}

export async function startPackCheckout(
  packId: CreditPackId,
  getIdToken: () => Promise<string>,
  quantity = 1,
  fetchImpl: typeof fetch = fetch,
): Promise<CheckoutResponse> {
  const res = await fetchImpl('/api/billing/checkout', {
    method: 'POST',
    headers: {
      ...(await apiHeaders(getIdToken)),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ packId, quantity }),
  });
  const payload = (await res.json().catch(() => null)) as { error?: string } | null;
  if (!res.ok) {
    throw new Error(payload?.error || `Couldn't start checkout (${res.status})`);
  }
  return CheckoutResponseSchema.parse(payload);
}

export async function fetchPaymentStatus(
  paymentId: string,
  getIdToken: () => Promise<string>,
  fetchImpl: typeof fetch = fetch,
): Promise<BillingStatusResponse> {
  const res = await fetchImpl(
    `/api/billing/status?payment_id=${encodeURIComponent(paymentId)}`,
    {
      cache: 'no-store',
      headers: await apiHeaders(getIdToken),
    },
  );
  if (!res.ok) throw new Error(`Couldn't check payment status (${res.status})`);
  return BillingStatusResponseSchema.parse(await res.json());
}
