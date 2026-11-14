/**
 * Friendly copy for Firebase Auth error codes (brand voice: warm, short, with a next step).
 * Unknown codes fall back to a generic line; the raw code is never shown.
 */
const MESSAGES: Record<string, string> = {
  'auth/invalid-credential': 'That email and password don’t match. Try again or reset it.',
  'auth/wrong-password': 'That email and password don’t match. Try again or reset it.',
  'auth/user-not-found': 'That email and password don’t match. Try again or reset it.',
  'auth/invalid-email': 'That doesn’t look like an email address.',
  'auth/missing-email': 'Add your email first.',
  'auth/missing-password': 'Add your password first.',
  'auth/email-already-in-use': 'You already have an account. Sign in instead.',
  'auth/weak-password': 'Use at least 6 characters for your password.',
  'auth/too-many-requests': 'Too many tries. Take a breath and try again in a minute.',
  'auth/network-request-failed': 'Needs connection. Check your internet and try again.',
  'auth/popup-blocked': 'Your browser blocked the Google window. Allow pop-ups and try again.',
  'auth/user-disabled': 'This account is turned off. Contact support if that’s a surprise.',
  'auth/operation-not-allowed': 'This sign-in method isn’t turned on yet.',
  'auth/unauthorized-domain': 'Sign-in isn’t allowed from this address yet.',
  'auth/firebase-app-check-token-is-invalid':
    'We couldn’t verify this browser. Refresh and try again.',
};

/** Codes that mean the user simply closed the Google window: show nothing. */
const SILENT = new Set(['auth/popup-closed-by-user', 'auth/cancelled-popup-request']);

export const GENERIC_AUTH_ERROR = 'Something went wrong signing you in. Try again.';

export function authErrorCode(err: unknown): string | null {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    const code = (err as { code: unknown }).code;
    return typeof code === 'string' ? code : null;
  }
  return null;
}

/** Message to show for an auth failure, or null when nothing should be shown. */
export function authErrorMessage(err: unknown): string | null {
  const code = authErrorCode(err);
  if (code && SILENT.has(code)) return null;
  return (code && MESSAGES[code]) || GENERIC_AUTH_ERROR;
}
