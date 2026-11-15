import { firebaseEnabled, getAuthClient } from '@/lib/firebase/client';
import { apiHeaders } from '@/lib/users/bootstrap-client';
import { PlanAllowanceResponseSchema } from './plan-allowance-logic';

export type PlanAllowance = { allowed: true } | { allowed: false; reason: 'limit' | 'unavailable' };

const UNAVAILABLE: PlanAllowance = { allowed: false, reason: 'unavailable' };

/**
 * Ask `POST /api/ai/plan-allowance` whether one more free cloud plan fits today (spec 07 design,
 * AI flow 2). This is `cloudAllowed` for `planVideo`. Local mode, no signed-in user, a non-200,
 * a malformed body or any thrown error all answer `unavailable`, so the director falls back to
 * its built-in rules. Tokens are sent as headers only and never logged.
 */
export async function requestPlanAllowance(): Promise<PlanAllowance> {
  try {
    if (!firebaseEnabled()) return UNAVAILABLE;
    const auth = await getAuthClient();
    await auth.authStateReady();
    const user = auth.currentUser;
    if (!user) return UNAVAILABLE;
    const res = await fetch('/api/ai/plan-allowance', {
      method: 'POST',
      headers: await apiHeaders(() => user.getIdToken()),
    });
    if (!res.ok) return UNAVAILABLE;
    const body = PlanAllowanceResponseSchema.safeParse(await res.json());
    if (!body.success) return UNAVAILABLE;
    return body.data.allowed ? { allowed: true } : { allowed: false, reason: 'limit' };
  } catch {
    return UNAVAILABLE;
  }
}
