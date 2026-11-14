import type { FirebaseApp } from 'firebase/app';
import type { AppCheck } from 'firebase/app-check';
import type { Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import type { FirebaseStorage } from 'firebase/storage';
import type { RemoteConfig } from 'firebase/remote-config';
import type { AI } from 'firebase/ai';
import { readFirebaseEnv, type FirebaseEnv } from './config';

/**
 * Lazy Firebase client (spec 01 R3.1–R3.3). Nothing loads until a getter is called, and every
 * service module is imported on demand so pages that never touch Firebase don't pay for it.
 * Browser only: getters reject during SSR. When the env has no Firebase config, `firebaseEnabled()`
 * is false and callers stay on their local paths.
 */

export const EMULATOR_PORTS = { auth: 9099, firestore: 8080, storage: 9199 } as const;

declare global {
  // Read by firebase/app-check before initializeAppCheck (debug provider).
  var FIREBASE_APPCHECK_DEBUG_TOKEN: string | boolean | undefined;
}

let env: FirebaseEnv | null | undefined;
function getEnv(): FirebaseEnv | null {
  if (env === undefined) env = readFirebaseEnv();
  return env;
}

export function firebaseEnabled(): boolean {
  return typeof window !== 'undefined' && getEnv() !== null;
}

function requireEnv(): FirebaseEnv {
  if (typeof window === 'undefined') throw new Error('Firebase client is browser-only');
  const e = getEnv();
  if (!e) throw new Error('Firebase is not configured (NEXT_PUBLIC_FIREBASE_* missing)');
  return e;
}

/** Memoise an async factory; a failed attempt is forgotten so the next call retries. */
function lazy<T>(factory: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | undefined;
  return () => {
    pending ??= factory().catch((err: unknown) => {
      pending = undefined;
      throw err;
    });
    return pending;
  };
}

export const getFirebaseApp = lazy(async (): Promise<FirebaseApp> => {
  const e = requireEnv();
  const { getApps, initializeApp } = await import('firebase/app');
  const app = getApps()[0] ?? initializeApp(e.config);
  await getAppCheckClient();
  return app;
});

/**
 * App Check with reCAPTCHA Enterprise. In development a registered debug token from
 * `.env.local` replaces attestation. Without a site key App Check is skipped (AI Logic and
 * enforced services then reject requests, which callers surface as "Using local fallback").
 */
export const getAppCheckClient = lazy(async (): Promise<AppCheck | null> => {
  const e = requireEnv();
  if (!e.recaptchaSiteKey) return null;
  const { getApps, initializeApp } = await import('firebase/app');
  const app = getApps()[0] ?? initializeApp(e.config);
  if (e.appCheckDebugToken) globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN = e.appCheckDebugToken;
  const { initializeAppCheck, ReCaptchaEnterpriseProvider } = await import('firebase/app-check');
  return initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(e.recaptchaSiteKey),
    isTokenAutoRefreshEnabled: true,
  });
});

export const getAuthClient = lazy(async (): Promise<Auth> => {
  const app = await getFirebaseApp();
  const { getAuth, connectAuthEmulator } = await import('firebase/auth');
  const auth = getAuth(app);
  if (requireEnv().useEmulators) {
    connectAuthEmulator(auth, `http://127.0.0.1:${EMULATOR_PORTS.auth}`, { disableWarnings: true });
  }
  return auth;
});

export const getDb = lazy(async (): Promise<Firestore> => {
  const app = await getFirebaseApp();
  const { getFirestore, connectFirestoreEmulator } = await import('firebase/firestore');
  const db = getFirestore(app);
  if (requireEnv().useEmulators)
    connectFirestoreEmulator(db, '127.0.0.1', EMULATOR_PORTS.firestore);
  return db;
});

export const getStorageClient = lazy(async (): Promise<FirebaseStorage> => {
  const app = await getFirebaseApp();
  const { getStorage, connectStorageEmulator } = await import('firebase/storage');
  const storage = getStorage(app);
  if (requireEnv().useEmulators)
    connectStorageEmulator(storage, '127.0.0.1', EMULATOR_PORTS.storage);
  return storage;
});

export const getRemoteConfigClient = lazy(async (): Promise<RemoteConfig> => {
  const app = await getFirebaseApp();
  const { getRemoteConfig } = await import('firebase/remote-config');
  const rc = getRemoteConfig(app);
  // Fetches are cheap but rate limited; one per hour in production, one per minute in dev.
  rc.settings.minimumFetchIntervalMillis =
    process.env.NODE_ENV === 'development' ? 60_000 : 3_600_000;
  return rc;
});

// Current Gemini models are served from the global endpoint only (checked 2026-11-14; us-central1 404s).
export const AI_LOCATION = 'global';

/** AI Logic (Agent Platform (Vertex) backend, global endpoint, by default, D-025) with limited-use App Check tokens. */
export const getAILogic = lazy(async (): Promise<AI> => {
  const app = await getFirebaseApp();
  const { getAI, GoogleAIBackend, AgentPlatformBackend } = await import('firebase/ai');
  const backend =
    requireEnv().aiBackend === 'google'
      ? new GoogleAIBackend()
      : new AgentPlatformBackend(AI_LOCATION);
  return getAI(app, { backend, useLimitedUseAppCheckTokens: true });
});
