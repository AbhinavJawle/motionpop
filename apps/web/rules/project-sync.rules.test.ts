import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  getDocs,
  limit,
  query,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { diffCloud, toCloud } from '../lib/projects/cloud-docs';
import { demoProject } from '../lib/projects/fixture';
import { createEnv } from './helpers';

/** The exact write pattern of `firestore-cloud.ts` (D-068) against the deployed rules. */
let env: RulesTestEnvironment;
beforeAll(async () => {
  env = await createEnv({ firestore: true });
});
afterAll(async () => {
  await env.cleanup();
});
beforeEach(async () => {
  await env.clearFirestore();
});

async function push(uid: string) {
  const db = env.authenticatedContext(uid).firestore();
  const set = toCloud(demoProject(1000), uid);
  const writes = diffCloud(null, set);
  const project = writes.find((w) => w.op === 'set' && w.path === null);
  if (project?.op !== 'set') throw new Error('no project write');
  // New project: the project document first, then the sub-documents with the project last.
  await setDoc(doc(db, 'projects', 'demo'), project.data);
  const batch = writeBatch(db);
  for (const w of writes) {
    const ref = w.path
      ? doc(db, 'projects', 'demo', w.path.sub, w.path.id)
      : doc(db, 'projects', 'demo');
    if (w.op === 'set') batch.set(ref, w.data);
    else batch.delete(ref);
  }
  await batch.commit();
  return db;
}

describe('project sync against the rules (spec 11 R1)', () => {
  it('the owner creates a project with its slots, versions and transcript', async () => {
    const db = await push('alice');
    const slots = await assertSucceeds(getDocs(collection(db, 'projects', 'demo', 'slots')));
    expect(slots.size).toBe(demoProject().slots.length);
    const mine = await assertSucceeds(
      getDocs(query(collection(db, 'projects'), where('ownerId', '==', 'alice'), limit(200))),
    );
    expect(mine.docs.map((d) => d.id)).toEqual(['demo']);
  });

  it('nobody else reads or writes it', async () => {
    await push('alice');
    const bob = env.authenticatedContext('bob').firestore();
    await assertFails(getDocs(collection(bob, 'projects', 'demo', 'slots')));
    await assertFails(setDoc(doc(bob, 'projects', 'demo', 'slots', 'x'), { json: '{}' }));
    await assertFails(getDocs(query(collection(bob, 'projects'), limit(10))));
  });

  it('a project created for someone else is refused', async () => {
    const db = env.authenticatedContext('bob').firestore();
    await assertFails(setDoc(doc(db, 'projects', 'p2'), toCloud(demoProject(1), 'alice').project));
  });
});
