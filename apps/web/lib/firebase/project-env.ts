import { z } from 'zod';

type Env = Readonly<Record<string, string | undefined>>;

/** The part of App Hosting's runtime `FIREBASE_CONFIG` (JSON) the server needs. */
const FirebaseConfigSchema = z.object({
  projectId: z.string().min(1).optional(),
  storageBucket: z.string().min(1).optional(),
});

function firebaseConfig(env: Env): z.infer<typeof FirebaseConfigSchema> {
  const raw = env['FIREBASE_CONFIG'];
  if (!raw) return {};
  try {
    const parsed = FirebaseConfigSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

/**
 * The Google Cloud project of this server. App Hosting sets `FIREBASE_CONFIG` at run time, not
 * `GOOGLE_CLOUD_PROJECT`; and `NEXT_PUBLIC_*` reads by computed key are not inlined by Next, so
 * a server route reading only those found nothing in production (first hosted export, 2026-11-16).
 */
export function projectIdFrom(env: Env): string | undefined {
  return (
    env['GOOGLE_CLOUD_PROJECT'] ??
    env['GCLOUD_PROJECT'] ??
    firebaseConfig(env).projectId ??
    env['NEXT_PUBLIC_FIREBASE_PROJECT_ID']
  );
}

/** The default Storage bucket, from the same sources. */
export function storageBucketFrom(env: Env): string | undefined {
  const project = projectIdFrom(env);
  return (
    env['STORAGE_BUCKET'] ??
    firebaseConfig(env).storageBucket ??
    env['NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET'] ??
    (project ? `${project}.firebasestorage.app` : undefined)
  );
}
