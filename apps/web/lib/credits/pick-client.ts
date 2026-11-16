/**
 * Which credits client a situation gets (spec 09 design, "Credits seam"; spec 13 R5.5). Pure.
 * `LocalCredits` is never used with Firebase configured outside the fake-AI flag, so a hosted
 * build can't run real cloud calls against fake credits.
 */
export type CreditsPick =
  | { client: 'local'; cloudAvailable: boolean; cloudBlockedReason: string | null }
  | { client: 'server'; cloudAvailable: true; cloudBlockedReason: null }
  | { client: 'none'; cloudAvailable: false; cloudBlockedReason: string };

export const SIGN_IN_FOR_CLOUD = 'Sign in to use cloud AI';
export const CLOUD_COMING_SOON = 'Cloud AI is coming soon';

export function pickCreditsClient(i: {
  firebaseEnabled: boolean;
  fakeAi: boolean;
  signedIn: boolean;
}): CreditsPick {
  if (i.fakeAi) return { client: 'local', cloudAvailable: true, cloudBlockedReason: null };
  if (!i.firebaseEnabled) {
    return { client: 'local', cloudAvailable: false, cloudBlockedReason: SIGN_IN_FOR_CLOUD };
  }
  if (!i.signedIn)
    return { client: 'none', cloudAvailable: false, cloudBlockedReason: SIGN_IN_FOR_CLOUD };
  return { client: 'server', cloudAvailable: true, cloudBlockedReason: null };
}

/** `NEXT_PUBLIC_FAKE_AI=1` counts only outside production builds (spec 09 P9). */
export function fakeAiFlag(env: { NODE_ENV?: string; NEXT_PUBLIC_FAKE_AI?: string }): boolean {
  return env.NODE_ENV !== 'production' && env.NEXT_PUBLIC_FAKE_AI === '1';
}
