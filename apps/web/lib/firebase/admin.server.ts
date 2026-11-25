import 'server-only';
import { applicationDefault, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAppCheck } from 'firebase-admin/app-check';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getRemoteConfig } from 'firebase-admin/remote-config';
import { projectIdFrom } from './project-env';

/**
 * Firebase Admin (spec 01 design). Credentials come from Application Default Credentials: the
 * App Hosting service account in production, `gcloud auth application-default login` locally.
 * When `FIREBASE_AUTH_EMULATOR_HOST` / `FIRESTORE_EMULATOR_HOST` are set, the SDK talks to the
 * emulators and needs no credentials.
 */
function projectId(): string | undefined {
  return projectIdFrom(process.env);
}

export function usingEmulators(): boolean {
  return Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST || process.env.FIRESTORE_EMULATOR_HOST);
}

let app: App | undefined;
export function adminApp(): App {
  if (app) return app;
  const existing = getApps()[0];
  const id = projectId();
  app =
    existing ??
    initializeApp(
      usingEmulators()
        ? { ...(id ? { projectId: id } : {}) }
        : { credential: applicationDefault(), ...(id ? { projectId: id } : {}) },
    );
  return app;
}

export const adminAuth = () => getAuth(adminApp());
export const adminDb = () => getFirestore(adminApp());
export const adminAppCheck = () => getAppCheck(adminApp());
export const adminRemoteConfig = () => getRemoteConfig(adminApp());
