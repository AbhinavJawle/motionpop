// The real dependencies of the render job: Firestore and Storage through the Admin SDK (the job's
// service account, or the emulators when their hosts are set), headless Chrome, the HyperFrames
// producer and ffmpeg. Loaded by `job.ts` at run time only.
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { jsonLogger, systemClock } from './clock';
import { loadCompileAssets } from './compile-assets';
import { createProcessFfmpeg } from './ffmpeg';
import { GcsBlobStore } from './gcs-blobs';
import type { RenderDeps } from './ports';
import { createChromePreflight } from './preflight';
import { createHyperframesProducer } from './producer';
import { FirestoreRenderStore } from './store/firestore';
import type { JobEnv } from './job';

const usingEmulators = (env: JobEnv): boolean =>
  Boolean(env['FIRESTORE_EMULATOR_HOST'] || env['FIREBASE_STORAGE_EMULATOR_HOST']);

export async function buildCloudDeps(renderId: string, env: JobEnv): Promise<RenderDeps> {
  const projectId = env['GOOGLE_CLOUD_PROJECT'] ?? env['GCLOUD_PROJECT'];
  const bucketName =
    env['STORAGE_BUCKET'] ?? (projectId ? `${projectId}.firebasestorage.app` : undefined);
  if (!bucketName) throw new Error('STORAGE_BUCKET or GOOGLE_CLOUD_PROJECT must be set');
  const app =
    getApps()[0] ??
    initializeApp({
      ...(usingEmulators(env) ? {} : { credential: applicationDefault() }),
      ...(projectId ? { projectId } : {}),
      storageBucket: bucketName,
    });
  return {
    store: new FirestoreRenderStore(getFirestore(app)),
    blobs: new GcsBlobStore(getStorage(app).bucket(bucketName)),
    // Cloud Run gives Chrome no user namespace sandbox; the container itself is the boundary.
    preflight: createChromePreflight({ noSandbox: env['CHROME_NO_SANDBOX'] === '1' }),
    producer: createHyperframesProducer(),
    ffmpeg: createProcessFfmpeg(),
    assets: await loadCompileAssets(),
    clock: systemClock,
    workDir: join(env['RENDER_WORK_ROOT'] ?? tmpdir(), `render-${renderId}`),
    log: jsonLogger,
  };
}
