import 'server-only';
import {
  createShare,
  failRender,
  recordExecution,
  startExport,
  sweepIfStalled,
} from '@motionpop/render/store';
import { contentDisposition } from '@motionpop/render';
import { isRenderable } from '@motionpop/motion/compiler';
import {
  ACTIVE_RENDER_STATUSES,
  APP_CONFIG_DEFAULTS,
  RenderDocSchema,
  type RenderDoc,
} from '@motionpop/schemas';
import { adminDb } from '@/lib/firebase/admin.server';
import { serverConfig } from '@/lib/firebase/server-config.server';
import {
  firstReusable,
  type CheckDeps,
  type CreateDeps,
  type DownloadDeps,
  type ShareDeps,
} from './handlers.server';
import type { LocalDeps } from './local-handlers.server';
import { bucket } from './storage.server';

export { bucket };
import { launcherFor } from './launcher.server';
import type { RenderMode } from './mode';

// The real dependencies of the render routes: Firestore and Storage through the Admin SDK (the
// emulators when their hosts are set), the server config and the launcher of the render mode.

const logLine = (fields: Record<string, unknown>): void => console.error(JSON.stringify(fields));

async function getRenderDoc(renderId: string): Promise<RenderDoc | null> {
  const snap = await adminDb().doc(`renders/${renderId}`).get();
  if (!snap.exists) return null;
  const parsed = RenderDocSchema.safeParse(snap.data());
  return parsed.success ? parsed.data : null;
}

export function createDeps(mode: Exclude<RenderMode, 'offline'>): CreateDeps {
  const db = adminDb();
  return {
    mode,
    config: serverConfig,
    now: () => Date.now(),
    voiceObject: async (path) => {
      try {
        const [meta] = await bucket().file(path).getMetadata();
        return {
          size: Number(meta.size ?? 0),
          contentType: typeof meta.contentType === 'string' ? meta.contentType : undefined,
        };
      } catch (e) {
        if ((e as { code?: number }).code === 404) return null;
        throw e;
      }
    },
    isRenderable,
    sweepStalled: async (uid, nowMs) => {
      const active = await db
        .collection('renders')
        .where('ownerId', '==', uid)
        .where('status', 'in', [...ACTIVE_RENDER_STATUSES])
        .limit(5)
        .get();
      await Promise.all(active.docs.map((d) => sweepIfStalled(db, d.id, nowMs)));
    },
    startExport: (renderId, render, cost, cfg, nowMs) =>
      startExport(db, renderId, render, cost, cfg, nowMs),
    balanceOf: async (uid) => {
      const snap = await db.doc(`users/${uid}`).get();
      const credits = snap.data()?.['credits'];
      return typeof credits === 'number' ? credits : 0;
    },
    // Two equality filters need no composite index (Firestore merges single-field indexes).
    findReusable: async (uid, key) => {
      const snap = await db
        .collection('renders')
        .where('ownerId', '==', uid)
        .where('key', '==', key)
        .limit(10)
        .get();
      const candidates: { renderId: string; doc: RenderDoc }[] = [];
      for (const d of snap.docs) {
        const parsed = RenderDocSchema.safeParse(d.data());
        if (parsed.success) candidates.push({ renderId: d.id, doc: parsed.data });
      }
      return firstReusable(candidates, async (path) => {
        const [exists] = await bucket().file(path).exists();
        return exists;
      });
    },
    writeSnapshot: async (path, json) => {
      await bucket().file(path).save(json, { contentType: 'application/json', resumable: false });
    },
    // Built per launch: a missing project or job setting fails this render, not every request.
    launch: (renderId) => launcherFor(mode).launch(renderId),
    recordExecution: (renderId, name) => recordExecution(db, renderId, name),
    failRender: (renderId, code, message) => failRender(db, renderId, code, message),
    log: logLine,
  };
}

export function checkDeps(): CheckDeps {
  const db = adminDb();
  return {
    getRender: getRenderDoc,
    now: () => Date.now(),
    sweep: (renderId, nowMs) => sweepIfStalled(db, renderId, nowMs),
  };
}

export function downloadDeps(mode: RenderMode): DownloadDeps {
  return {
    mode,
    getRender: getRenderDoc,
    disposition: contentDisposition,
    signedUrl: async (path, disposition, ttlMs) => {
      const [url] = await bucket()
        .file(path)
        .getSignedUrl({
          version: 'v4',
          action: 'read',
          expires: Date.now() + ttlMs,
          responseDisposition: disposition,
        });
      return url;
    },
  };
}

export function shareDeps(): ShareDeps {
  const db = adminDb();
  return { createShare: (renderId, uid) => createShare(db, renderId, uid) };
}

/**
 * Offline mode: the singletons of `@motionpop/render/offline` (loaded on first use, because they
 * pull in Chrome and the producer), the OS temp directory as the bucket, no credits.
 */
export async function localDeps(): Promise<LocalDeps> {
  const { offlineRuntime, runOffline } = await import('@motionpop/render/offline');
  const { randomBytes } = await import('node:crypto');
  const rt = offlineRuntime();
  const launcher = launcherFor('offline', { runOffline: (id) => runOffline(id) });
  return {
    // No Firebase in offline mode: the typed defaults, not a Remote Config call that would wait
    // for credentials that do not exist (it cost the first export 10 s).
    config: async () => APP_CONFIG_DEFAULTS,
    now: () => new Date(),
    isRenderable,
    putBlob: (path, data) => rt.blobs.put(path, data),
    createDoc: (renderId, doc) => rt.store.create(renderId, doc),
    getRender: (renderId) => rt.store.get(renderId),
    launch: (renderId) => launcher.launch(renderId),
    newRenderId: () => `l${randomBytes(15).toString('base64url')}`,
    log: logLine,
  };
}

/** The offline bucket, for the file route. */
export async function localBlobs() {
  const { offlineRuntime } = await import('@motionpop/render/offline');
  return offlineRuntime().blobs;
}
