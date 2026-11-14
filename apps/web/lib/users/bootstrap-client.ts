import { z } from 'zod';
import { PlanSchema } from '@motionpop/schemas';
import { getAppCheckClient } from '../firebase/client';

export const BootstrapResponseSchema = z.object({
  created: z.boolean(),
  plan: PlanSchema,
  credits: z.number().int().nonnegative(),
});
export type BootstrapResponse = z.infer<typeof BootstrapResponseSchema>;

/** Headers for our API routes: ID token plus an App Check token when App Check is on. */
export async function apiHeaders(getIdToken: () => Promise<string>): Promise<HeadersInit> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${await getIdToken()}`,
  };
  const appCheck = await getAppCheckClient();
  if (appCheck) {
    const { getToken } = await import('firebase/app-check');
    headers['X-Firebase-AppCheck'] = (await getToken(appCheck, false)).token;
  }
  return headers;
}

/** Call `POST /api/users/bootstrap`; the response is parsed with zod. */
export async function bootstrapCurrentUser(
  getIdToken: () => Promise<string>,
): Promise<BootstrapResponse> {
  const res = await fetch('/api/users/bootstrap', {
    method: 'POST',
    headers: await apiHeaders(getIdToken),
  });
  if (!res.ok) throw new Error(`bootstrap failed: ${res.status}`);
  return BootstrapResponseSchema.parse(await res.json());
}
