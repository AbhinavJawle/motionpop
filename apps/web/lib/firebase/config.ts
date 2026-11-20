import { z } from 'zod';

/**
 * Firebase web config from `NEXT_PUBLIC_FIREBASE_*` (spec 01 R3.1). The values are public by
 * design; protection comes from App Check and security rules. Missing config is not an error:
 * the app then runs local-only (IndexedDB projects, deterministic AI fallbacks).
 */
export const FirebaseWebConfigSchema = z.object({
  apiKey: z.string().min(1),
  authDomain: z.string().min(1),
  projectId: z.string().min(1),
  storageBucket: z.string().min(1),
  messagingSenderId: z.string().min(1),
  appId: z.string().min(1),
  measurementId: z.string().min(1).optional(),
});
export type FirebaseWebConfig = z.infer<typeof FirebaseWebConfigSchema>;

export interface FirebaseEnv {
  config: FirebaseWebConfig;
  /** reCAPTCHA Enterprise site key for App Check. Without it App Check is skipped. */
  recaptchaSiteKey?: string;
  /** Registered App Check debug token (local dev only, never committed). */
  appCheckDebugToken?: string;
  /** Connect Auth, Firestore and Storage to the local Emulator Suite. */
  useEmulators: boolean;
  /**
   * AI Logic backend. `vertex` bills per call on the Blaze plan with no prepay; `google` (the
   * Gemini Developer API) needs prepaid credits once billing is linked (D-025).
   */
  aiBackend: 'vertex' | 'google';
  /** Active local dev cloud profile name (e.g. `personal` or `lab`), development builds only. */
  cloudProfile?: string;
}

/** Raw env values, read with literal `process.env.X` so Next inlines them into the client bundle. */
export interface RawFirebaseEnv {
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
  measurementId?: string;
  recaptchaSiteKey?: string;
  appCheckDebugToken?: string;
  useEmulators?: string;
  aiBackend?: string;
  cloudProfile?: string;
}

const blankToUndefined = (v: string | undefined): string | undefined =>
  v && v.trim() ? v.trim() : undefined;

/** Parse the raw env. Returns null when the web config is missing or incomplete. */
export function parseFirebaseEnv(raw: RawFirebaseEnv): FirebaseEnv | null {
  const parsed = FirebaseWebConfigSchema.safeParse({
    apiKey: blankToUndefined(raw.apiKey),
    authDomain: blankToUndefined(raw.authDomain),
    projectId: blankToUndefined(raw.projectId),
    storageBucket: blankToUndefined(raw.storageBucket),
    messagingSenderId: blankToUndefined(raw.messagingSenderId),
    appId: blankToUndefined(raw.appId),
    measurementId: blankToUndefined(raw.measurementId),
  });
  if (!parsed.success) return null;
  const recaptchaSiteKey = blankToUndefined(raw.recaptchaSiteKey);
  const appCheckDebugToken = blankToUndefined(raw.appCheckDebugToken);
  const cloudProfile = blankToUndefined(raw.cloudProfile);
  return {
    config: parsed.data,
    ...(recaptchaSiteKey ? { recaptchaSiteKey } : {}),
    ...(appCheckDebugToken ? { appCheckDebugToken } : {}),
    ...(cloudProfile ? { cloudProfile } : {}),
    useEmulators: raw.useEmulators?.trim().toLowerCase() === 'true',
    aiBackend: raw.aiBackend?.trim().toLowerCase() === 'google' ? 'google' : 'vertex',
  };
}

export function readFirebaseEnv(): FirebaseEnv | null {
  return parseFirebaseEnv({
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
    recaptchaSiteKey: process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY,
    // Only honoured in development builds, so a stray token can never ship to production.
    appCheckDebugToken:
      process.env.NODE_ENV === 'development'
        ? process.env.NEXT_PUBLIC_APPCHECK_DEBUG_TOKEN
        : undefined,
    useEmulators: process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS,
    aiBackend: process.env.NEXT_PUBLIC_AI_BACKEND,
    cloudProfile:
      process.env.NODE_ENV === 'development' ? process.env.NEXT_PUBLIC_CLOUD_PROFILE : undefined,
  });
}
