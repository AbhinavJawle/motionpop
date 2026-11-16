// Share links on the Firestore emulator (spec 08 task 12, R5.3, R5.4): one share per render,
// made once, found again, and loaded only while it is live.
import { randomUUID } from 'node:crypto';
import { getApps, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  FirestoreRenderStore,
  QUEUED_STALL_MS,
  createShare,
  failRender,
  loadShare,
  renderIdFor,
  startExport,
  sweepIfStalled,
  type ExportConfig,
} from '@motionpop/render/store';
import { ShareDocSchema, renderPaths } from '@motionpop/schemas';
import { PROJECT_ID } from './helpers';
import { ledgerTools } from './ledger-tools';

const APP_NAME = 'shares-emulator-test';
const CFG: ExportConfig = {
  exportsEnabled: true,
  killSwitch: false,
  rendersPerUserPerDay: 100,
  judgeCredits: 500,
};

let app: App;
let db: Firestore;
let tools: ReturnType<typeof ledgerTools>;

beforeAll(() => {
  if (!process.env['FIRESTORE_EMULATOR_HOST']) {
    throw new Error('FIRESTORE_EMULATOR_HOST is not set; run via `pnpm test:rules`.');
  }
  app =
    getApps().find((a) => a.name === APP_NAME) ??
    initializeApp({ projectId: PROJECT_ID }, APP_NAME);
  db = getFirestore(app);
  tools = ledgerTools(db);
});

afterAll(async () => {
  await db.terminate();
});

/** A render for a new user, finished (`done`) unless `finish` is false. */
async function render(finish = true) {
  const uid = await tools.seed(20);
  const requestId = randomUUID();
  const renderId = renderIdFor(uid, requestId);
  const started = await startExport(
    db,
    renderId,
    {
      ownerId: uid,
      projectId: 'proj-1',
      requestId,
      title: 'Shared film',
      format: '16:9',
      resolution: '1080p',
      captions: false,
      music: false,
      durationMs: 18_000,
      slotCount: 1,
      mode: 'emulator',
      inputPath: renderPaths(uid, 'proj-1', renderId).input,
      voicePath: `users/${uid}/audio/proj-1/voice-0123456789abcdef.wav`,
    },
    5,
    CFG,
    Date.now(),
  );
  expect(started.kind).toBe('created');
  if (finish) {
    const store = new FirestoreRenderStore(db);
    await store.markStarted(renderId);
    await store.progress(renderId, 'encoding', 90);
    await store.markDone(renderId, {
      outputPath: renderPaths(uid, 'proj-1', renderId).output,
      thumbPath: renderPaths(uid, 'proj-1', renderId).thumb,
      sizeBytes: 123,
    });
  }
  return { uid, renderId };
}

describe('createShare', () => {
  it('makes a share doc once, stores its id on the render and returns the same id again', async () => {
    const { uid, renderId } = await render();
    const first = await createShare(db, renderId, uid);
    expect(first).toMatchObject({ kind: 'ok', created: true });
    if (first.kind !== 'ok') return;
    expect(first.shareId).toMatch(/^[A-Za-z0-9_-]{22}$/);
    const share = ShareDocSchema.parse((await db.doc(`shares/${first.shareId}`).get()).data());
    expect(share).toMatchObject({ ownerId: uid, projectId: 'proj-1', renderId, revoked: false });
    expect((await tools.renderDoc(renderId))?.shareId).toBe(first.shareId);

    const again = await createShare(db, renderId, uid);
    expect(again).toEqual({ kind: 'ok', shareId: first.shareId, created: false });
  });

  it('concurrent calls create one share', async () => {
    const { uid, renderId } = await render();
    const rs = await Promise.all(Array.from({ length: 6 }, () => createShare(db, renderId, uid)));
    const ids = new Set(rs.map((r) => (r.kind === 'ok' ? r.shareId : 'x')));
    expect(ids.size).toBe(1);
    expect(rs.filter((r) => r.kind === 'ok' && r.created)).toHaveLength(1);
    const all = await db.collection('shares').where('renderId', '==', renderId).get();
    expect(all.size).toBe(1);
  });

  it('answers not-found for someone else’s render, a missing one and a bad id, and not-done for a running one', async () => {
    const { uid, renderId } = await render();
    expect(await createShare(db, renderId, 'someone-else')).toEqual({ kind: 'not-found' });
    expect(await createShare(db, 'does-not-exist', uid)).toEqual({ kind: 'not-found' });
    expect(await createShare(db, '../x', uid)).toEqual({ kind: 'not-found' });
    const running = await render(false);
    expect(await createShare(db, running.renderId, running.uid)).toEqual({ kind: 'not-done' });
    // A failed render has no video to share either.
    const failed = await render(false);
    await failRender(db, failed.renderId, 'render-failed', 'x');
    expect(await createShare(db, failed.renderId, failed.uid)).toEqual({ kind: 'not-done' });
    expect(
      (await db.collection('shares').where('renderId', '==', running.renderId).get()).size,
    ).toBe(0);
  });

  it('makes a new share when the old one was revoked', async () => {
    const { uid, renderId } = await render();
    const first = await createShare(db, renderId, uid);
    if (first.kind !== 'ok') throw new Error('no share');
    await db.doc(`shares/${first.shareId}`).update({ revoked: true });
    const second = await createShare(db, renderId, uid);
    expect(second).toMatchObject({ kind: 'ok', created: true });
    if (second.kind === 'ok') expect(second.shareId).not.toBe(first.shareId);
  });
});

describe('loadShare', () => {
  it('loads a live share with its finished render', async () => {
    const { uid, renderId } = await render();
    const made = await createShare(db, renderId, uid);
    if (made.kind !== 'ok') throw new Error('no share');
    const loaded = await loadShare(db, made.shareId);
    expect(loaded).toMatchObject({ shareId: made.shareId, renderId });
    expect(loaded?.render.title).toBe('Shared film');
  });

  it('is null for a bad id, a missing share, a revoked one and a render that is no longer done', async () => {
    expect(await loadShare(db, 'short')).toBeNull();
    expect(await loadShare(db, 'a'.repeat(22))).toBeNull();
    const { uid, renderId } = await render();
    const made = await createShare(db, renderId, uid);
    if (made.kind !== 'ok') throw new Error('no share');
    await db.doc(`shares/${made.shareId}`).update({ revoked: true });
    expect(await loadShare(db, made.shareId)).toBeNull();
    // A render that vanished.
    const gone = await render();
    const g = await createShare(db, gone.renderId, gone.uid);
    if (g.kind !== 'ok') throw new Error('no share');
    await db.doc(`renders/${gone.renderId}`).delete();
    expect(await loadShare(db, g.shareId)).toBeNull();
    // A share whose owner differs from the render's owner is not trusted.
    const odd = await render();
    const o = await createShare(db, odd.renderId, odd.uid);
    if (o.kind !== 'ok') throw new Error('no share');
    await db.doc(`shares/${o.shareId}`).update({ ownerId: 'someone-else' });
    expect(await loadShare(db, o.shareId)).toBeNull();
  });

  it('keeps the sweep out of it: a done render is not touched by the sweeper', async () => {
    const { renderId } = await render();
    expect((await sweepIfStalled(db, renderId, Date.now() + 10 * QUEUED_STALL_MS))?.status).toBe(
      'done',
    );
  });
});
