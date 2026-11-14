/** Where to land after sign-in when no `next` is given. */
export const DEFAULT_AFTER_SIGN_IN = '/dashboard';

/**
 * Sanitise the `?next=` target (spec 01 R4.2). Only same-origin absolute paths are allowed, so
 * a crafted link can't bounce a freshly signed-in user to another site (open redirect).
 */
export function safeNextPath(raw: string | null | undefined): string {
  if (!raw) return DEFAULT_AFTER_SIGN_IN;
  const value = raw.trim();
  // Must be a path: "/x", never "//host", "/\host" (browsers treat "\" as "/"), or a scheme.
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) {
    return DEFAULT_AFTER_SIGN_IN;
  }
  // Control characters (tabs, newlines) are stripped by URL parsers and can smuggle "//".
  if (/[\u0000-\u001f\u007f]/.test(value)) return DEFAULT_AFTER_SIGN_IN;
  // Never loop back into the auth screens.
  if (value === '/sign-in' || value.startsWith('/sign-in?') || value.startsWith('/sign-in/')) {
    return DEFAULT_AFTER_SIGN_IN;
  }
  return value;
}

/** `/sign-in?next=<path>` for a protected location (path + search). */
export function signInHref(location: string): string {
  const next = safeNextPath(location);
  return next === DEFAULT_AFTER_SIGN_IN
    ? `/sign-in?next=${encodeURIComponent(DEFAULT_AFTER_SIGN_IN)}`
    : `/sign-in?next=${encodeURIComponent(next)}`;
}
