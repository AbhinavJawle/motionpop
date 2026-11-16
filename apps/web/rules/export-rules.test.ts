// Security rules for every path the export feature uses (spec 08 task 13, R8.1): render docs,
// shares, the export and refund ledger entries, the day counters, and the Storage paths of the
// voice and the render files. The server (Admin SDK) bypasses these rules; clients get read
// access to their own data and no write access to anything the server owns.
import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { deleteObject, getBytes, ref, uploadBytes } from 'firebase/storage';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createEnv } from './helpers';

let env: RulesTestEnvironment;

const DAY = '2026-11-16';
const RENDER = {
  schemaVersion: 1,
  ownerId: 'alice',
  projectId: 'p1',
  status: 'done',
  progress: 100,
  costCredits: 5,
  outputPath: 'users/alice/projects/p1/renders/r1/video.mp4',
};
const MB = 1024 * 1024;
const bytes = (n: number) => new Uint8Array(n);

beforeAll(async () => {
  env = await createEnv({ firestore: true, storage: true });
});
afterAll(async () => {
  await env.cleanup();
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.clearStorage();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users/alice'), { credits: 15, plan: 'free', schemaVersion: 1 });
    await setDoc(doc(db, 'renders/r1'), RENDER);
    await setDoc(doc(db, 'renders/r2'), { ...RENDER, status: 'queued', progress: 0 });
    await setDoc(doc(db, 'renders/rb'), { ...RENDER, ownerId: 'bob' });
    await setDoc(doc(db, 'shares/sh1'), { ownerId: 'alice', renderId: 'r1', revoked: false });
    await setDoc(doc(db, 'users/alice/credits/export-r1'), {
      delta: -5,
      reason: 'export',
      refId: 'r1',
      balanceAfter: 15,
    });
    await setDoc(doc(db, 'users/alice/credits/refund-r2'), {
      delta: 5,
      reason: 'refund',
      refId: 'r2',
      balanceAfter: 20,
    });
    await setDoc(doc(db, `users/alice/limits/${DAY}`), {
      schemaVersion: 1,
      planCloud: 0,
      renders: 2,
    });
    const s = ctx.storage();
    const meta = (contentType: string) => ({ contentType });
    await uploadBytes(
      ref(s, 'users/alice/projects/p1/renders/r1/input/project.json'),
      bytes(10),
      meta('application/json'),
    );
    await uploadBytes(
      ref(s, 'users/alice/projects/p1/renders/r1/video.mp4'),
      bytes(10),
      meta('video/mp4'),
    );
    await uploadBytes(
      ref(s, 'users/alice/projects/p1/renders/r1/thumb.jpg'),
      bytes(10),
      meta('image/jpeg'),
    );
    await uploadBytes(
      ref(s, 'users/alice/audio/p1/voice-0123456789abcdef.wav'),
      bytes(10),
      meta('audio/wav'),
    );
  });
});

const alice = () => env.authenticatedContext('alice').firestore();
const bob = () => env.authenticatedContext('bob').firestore();
const anon = () => env.unauthenticatedContext().firestore();
const aliceFiles = () => env.authenticatedContext('alice').storage();
const bobFiles = () => env.authenticatedContext('bob').storage();
const anonFiles = () => env.unauthenticatedContext().storage();

describe('renders/{id}', () => {
  it('the owner reads a render in every status; another user and anonymous cannot', async () => {
    for (const id of ['r1', 'r2']) {
      await assertSucceeds(getDoc(doc(alice(), `renders/${id}`)));
      await assertFails(getDoc(doc(bob(), `renders/${id}`)));
      await assertFails(getDoc(doc(anon(), `renders/${id}`)));
    }
  });

  it('the owner can run the queries the client runs (the active render, a list of their own)', async () => {
    const active = query(
      collection(alice(), 'renders'),
      where('ownerId', '==', 'alice'),
      where('status', 'in', ['queued', 'rendering', 'encoding']),
      limit(1),
    );
    const snap = await assertSucceeds(getDocs(active));
    expect(snap.docs.map((d) => d.id)).toEqual(['r2']);
    await assertSucceeds(
      getDocs(query(collection(alice(), 'renders'), where('ownerId', '==', 'alice'))),
    );
  });

  it('another user cannot list someone else’s renders, and nobody can list without the owner filter', async () => {
    await assertFails(
      getDocs(query(collection(bob(), 'renders'), where('ownerId', '==', 'alice'))),
    );
    await assertFails(getDocs(collection(alice(), 'renders')));
    await assertFails(getDocs(collection(anon(), 'renders')));
  });

  it('no client writes anything: create, replace, delete, or any single field of an update', async () => {
    await assertFails(
      setDoc(doc(alice(), 'renders/new'), { ...RENDER, status: 'queued', progress: 0 }),
    );
    await assertFails(setDoc(doc(alice(), 'renders/r1'), { ...RENDER, costCredits: 0 }));
    await assertFails(deleteDoc(doc(alice(), 'renders/r1')));
    // Field by field: a user can't skip the queue, fake progress, erase the cost, claim an
    // output or point a share at another file.
    const edits: Record<string, unknown> = {
      status: 'done',
      progress: 100,
      costCredits: 0,
      outputPath: 'users/bob/projects/p1/renders/rb/video.mp4',
      thumbPath: 'users/bob/x.jpg',
      shareId: 'abcdefghijklmnopqrstuv',
      error: 'render-failed',
      ownerId: 'bob',
      voicePath: 'users/bob/audio/p1/voice-0123456789abcdef.wav',
      inputPath: 'users/bob/projects/p1/renders/rb/input/project.json',
    };
    for (const [field, value] of Object.entries(edits)) {
      await assertFails(updateDoc(doc(alice(), 'renders/r2'), { [field]: value }));
    }
    // Another user can't write either, nor take over a render by adding themselves.
    await assertFails(updateDoc(doc(bob(), 'renders/r2'), { status: 'done' }));
    await assertFails(setDoc(doc(anon(), 'renders/r3'), RENDER));
  });
});

describe('shares/{id}', () => {
  it('is denied to every client for read, list, create, update and delete', async () => {
    for (const db of [alice(), bob(), anon()]) {
      await assertFails(getDoc(doc(db, 'shares/sh1')));
      await assertFails(getDocs(collection(db, 'shares')));
      await assertFails(
        setDoc(doc(db, 'shares/sh2'), { ownerId: 'alice', renderId: 'r1', revoked: false }),
      );
      await assertFails(updateDoc(doc(db, 'shares/sh1'), { revoked: true }));
      await assertFails(deleteDoc(doc(db, 'shares/sh1')));
    }
    // The owner can't read the share of their own render through a query either.
    await assertFails(
      getDocs(query(collection(alice(), 'shares'), where('ownerId', '==', 'alice'))),
    );
  });
});

describe('the ledger entries of an export', () => {
  it('the owner reads `export-*` and `refund-*` entries; others cannot', async () => {
    await assertSucceeds(getDoc(doc(alice(), 'users/alice/credits/export-r1')));
    await assertSucceeds(getDoc(doc(alice(), 'users/alice/credits/refund-r2')));
    await assertFails(getDoc(doc(bob(), 'users/alice/credits/export-r1')));
    await assertFails(getDoc(doc(anon(), 'users/alice/credits/refund-r2')));
  });

  it('no client creates, edits or deletes them: a free export or a double refund is not possible', async () => {
    const entry = { delta: 100, reason: 'refund', refId: 'r1', balanceAfter: 115 };
    await assertFails(setDoc(doc(alice(), 'users/alice/credits/refund-r1'), entry));
    await assertFails(
      setDoc(doc(alice(), 'users/alice/credits/export-r9'), {
        ...entry,
        delta: -5,
        reason: 'export',
      }),
    );
    await assertFails(updateDoc(doc(alice(), 'users/alice/credits/export-r1'), { delta: 0 }));
    await assertFails(updateDoc(doc(alice(), 'users/alice/credits/refund-r2'), { delta: 500 }));
    await assertFails(deleteDoc(doc(alice(), 'users/alice/credits/export-r1')));
    await assertFails(setDoc(doc(bob(), 'users/alice/credits/refund-r1'), entry));
    // And the balance stays out of reach next to a legal profile edit.
    await assertFails(updateDoc(doc(alice(), 'users/alice'), { displayName: 'A', credits: 9999 }));
  });
});

describe('limits/{day}.renders', () => {
  it('the owner reads the day counters; nobody writes the render count', async () => {
    await assertSucceeds(getDoc(doc(alice(), `users/alice/limits/${DAY}`)));
    await assertFails(getDoc(doc(bob(), `users/alice/limits/${DAY}`)));
    await assertFails(updateDoc(doc(alice(), `users/alice/limits/${DAY}`), { renders: 0 }));
    await assertFails(
      setDoc(doc(alice(), 'users/alice/limits/2026-11-17'), { schemaVersion: 1, renders: 0 }),
    );
    await assertFails(deleteDoc(doc(alice(), `users/alice/limits/${DAY}`)));
  });
});

describe('Storage: the render files', () => {
  const files = ['input/project.json', 'video.mp4', 'thumb.jpg'];
  const path = (f: string, uid = 'alice') => `users/${uid}/projects/p1/renders/r1/${f}`;

  it('the owner reads them; another user and anonymous cannot', async () => {
    for (const f of files) {
      await assertSucceeds(getBytes(ref(aliceFiles(), path(f))));
      await assertFails(getBytes(ref(bobFiles(), path(f))));
      await assertFails(getBytes(ref(anonFiles(), path(f))));
    }
  });

  it('no client writes, overwrites or deletes them, the owner included', async () => {
    const types: Record<string, string> = {
      'input/project.json': 'application/json',
      'video.mp4': 'video/mp4',
      'thumb.jpg': 'image/jpeg',
    };
    for (const f of files) {
      await assertFails(
        uploadBytes(ref(aliceFiles(), path(f)), bytes(5), { contentType: types[f]! }),
      );
      await assertFails(deleteObject(ref(aliceFiles(), path(f))));
      await assertFails(
        uploadBytes(ref(bobFiles(), path(f)), bytes(5), { contentType: types[f]! }),
      );
    }
    // A new render folder is no more writable than an old one.
    await assertFails(
      uploadBytes(ref(aliceFiles(), 'users/alice/projects/p1/renders/r9/video.mp4'), bytes(5), {
        contentType: 'video/mp4',
      }),
    );
    // Writing into another user's render folder is denied too.
    await assertFails(
      uploadBytes(ref(bobFiles(), 'users/alice/projects/p1/renders/r9/video.mp4'), bytes(5), {
        contentType: 'video/mp4',
      }),
    );
  });
});

describe('Storage: the voice of a project', () => {
  const voice = (ext: string, uid = 'alice') =>
    `users/${uid}/audio/p1/voice-0123456789abcdef.${ext}`;
  const TYPES: Record<string, string> = {
    wav: 'audio/wav',
    mp3: 'audio/mpeg',
    m4a: 'audio/mp4',
    webm: 'audio/webm',
    ogg: 'audio/ogg',
  };

  it('the owner reads the voice; another user and anonymous cannot', async () => {
    await assertSucceeds(getBytes(ref(aliceFiles(), voice('wav'))));
    await assertFails(getBytes(ref(bobFiles(), voice('wav'))));
    await assertFails(getBytes(ref(anonFiles(), voice('wav'))));
  });

  it('the owner uploads each accepted voice type, up to 50 MB and no more', async () => {
    for (const [ext, contentType] of Object.entries(TYPES)) {
      await assertSucceeds(uploadBytes(ref(aliceFiles(), voice(ext)), bytes(100), { contentType }));
    }
    await assertSucceeds(
      uploadBytes(ref(aliceFiles(), voice('wav')), bytes(50 * MB), { contentType: 'audio/wav' }),
    );
    await assertFails(
      uploadBytes(ref(aliceFiles(), voice('wav')), bytes(50 * MB + 1), {
        contentType: 'audio/wav',
      }),
    );
  });

  it('refuses a voice that is not audio, and any upload into someone else’s folder or when signed out', async () => {
    await assertFails(
      uploadBytes(ref(aliceFiles(), voice('wav')), bytes(10), { contentType: 'video/mp4' }),
    );
    await assertFails(
      uploadBytes(ref(aliceFiles(), voice('wav')), bytes(10), {
        contentType: 'application/octet-stream',
      }),
    );
    await assertFails(
      uploadBytes(ref(bobFiles(), voice('wav', 'alice')), bytes(10), { contentType: 'audio/wav' }),
    );
    await assertFails(
      uploadBytes(ref(anonFiles(), voice('wav')), bytes(10), { contentType: 'audio/wav' }),
    );
    await assertFails(deleteObject(ref(bobFiles(), voice('wav'))));
  });

  it('the owner can replace and delete their own voice', async () => {
    await assertSucceeds(
      uploadBytes(ref(aliceFiles(), voice('wav')), bytes(20), { contentType: 'audio/wav' }),
    );
    await assertSucceeds(deleteObject(ref(aliceFiles(), voice('wav'))));
  });
});
