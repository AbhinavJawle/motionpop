import 'server-only';
import { getStorage } from 'firebase-admin/storage';
import { adminApp } from '@/lib/firebase/admin.server';

// The default Storage bucket through the Admin SDK. A light module of its own, so the share page
// and the share video route don't pull the render launchers (and with them Chrome) into their trace.

function bucketName(): string {
  const e = process.env;
  const project =
    e['GOOGLE_CLOUD_PROJECT'] ?? e['GCLOUD_PROJECT'] ?? e['NEXT_PUBLIC_FIREBASE_PROJECT_ID'];
  const name =
    e['STORAGE_BUCKET'] ??
    e['NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET'] ??
    (project ? `${project}.firebasestorage.app` : undefined);
  if (!name) throw new Error('no Storage bucket is configured');
  return name;
}

export const bucket = () => getStorage(adminApp()).bucket(bucketName());
