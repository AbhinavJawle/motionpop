/**
 * Firebase App Hosting injects `FIREBASE_WEBAPP_CONFIG` (JSON) at build time. Map it onto the
 * `NEXT_PUBLIC_FIREBASE_*` names the client reads, so no web config is committed (the API key
 * is public by design, but secret scanners flag it). Values already set in the environment win,
 * so `.env.local` keeps working locally. Pure; used by next.config.ts.
 */
const KEYS = {
  apiKey: 'NEXT_PUBLIC_FIREBASE_API_KEY',
  authDomain: 'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  projectId: 'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  storageBucket: 'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
  messagingSenderId: 'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  appId: 'NEXT_PUBLIC_FIREBASE_APP_ID',
  measurementId: 'NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID',
} as const;

export function webappConfigEnv(env: Record<string, string | undefined>): Record<string, string> {
  const raw = env.FIREBASE_WEBAPP_CONFIG;
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof parsed !== 'object' || parsed === null) return {};
  const out: Record<string, string> = {};
  for (const [field, name] of Object.entries(KEYS)) {
    const value = (parsed as Record<string, unknown>)[field];
    if (typeof value === 'string' && value && env[name] === undefined) out[name] = value;
  }
  return out;
}
