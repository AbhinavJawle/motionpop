import 'server-only';
import { getStorage } from 'firebase-admin/storage';
import { adminApp } from '@/lib/firebase/admin.server';
import { storageBucketFrom } from '@/lib/firebase/project-env';

// The default Storage bucket through the Admin SDK. A light module of its own, so the share page
// and the share video route don't pull the render launchers (and with them Chrome) into their trace.

function bucketName(): string {
  const name = storageBucketFrom(process.env);
  if (!name) throw new Error('no Storage bucket is configured');
  return name;
}

export const bucket = () => getStorage(adminApp()).bucket(bucketName());
