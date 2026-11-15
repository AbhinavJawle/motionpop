import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import fc from 'fast-check';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createEnv } from './helpers';

let env: RulesTestEnvironment;

const USER_DOC = {
  displayName: 'Alice',
  email: 'alice@example.com',
  credits: 20,
  plan: 'free',
  settings: { preferOnDevice: true, captionsDefault: true, defaultFormat: '16:9' },
  schemaVersion: 1,
  createdAt: 1,
  lastSeenAt: 1,
};
const PROJECT = { ownerId: 'alice', title: 'Demo', format: '16:9', fps: 30 };
const DAY = '2026-11-15';
const LIMITS = { schemaVersion: 1, planCloud: 3, updatedAt: 1 };

beforeAll(async () => {
  env = await createEnv({ firestore: true });
});
afterAll(async () => {
  await env.cleanup();
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users/alice'), USER_DOC);
    await setDoc(doc(db, 'users/alice/credits/signup'), { delta: 20, balanceAfter: 20 });
    await setDoc(doc(db, 'users/alice/usage/e1'), { task: 'edit.patch' });
    await setDoc(doc(db, `users/alice/limits/${DAY}`), LIMITS);
    await setDoc(doc(db, 'users/alice/brandKits/b1'), { name: 'Kit' });
    await setDoc(doc(db, 'projects/p1'), PROJECT);
    await setDoc(doc(db, 'projects/p1/slots/s1'), { startMs: 0, endMs: 1000 });
    await setDoc(doc(db, 'renders/r1'), { ownerId: 'alice', projectId: 'p1', status: 'done' });
    await setDoc(doc(db, 'shares/sh1'), { ownerId: 'alice', projectId: 'p1' });
  });
});

const alice = () => env.authenticatedContext('alice').firestore();
const bob = () => env.authenticatedContext('bob').firestore();
const anon = () => env.unauthenticatedContext().firestore();

describe('users/{uid}', () => {
  it('owner reads own doc; others and anonymous cannot', async () => {
    await assertSucceeds(getDoc(doc(alice(), 'users/alice')));
    await assertFails(getDoc(doc(bob(), 'users/alice')));
    await assertFails(getDoc(doc(anon(), 'users/alice')));
  });

  it('owner updates displayName, photoURL, settings, lastSeenAt', async () => {
    await assertSucceeds(
      updateDoc(doc(alice(), 'users/alice'), {
        displayName: 'Al',
        photoURL: 'https://example.com/a.png',
        settings: { ...USER_DOC.settings, preferOnDevice: false },
        lastSeenAt: 2,
      }),
    );
  });

  it.each(['credits', 'plan', 'schemaVersion', 'createdAt', 'email'])(
    'owner cannot change %s',
    async (key) => {
      await assertFails(updateDoc(doc(alice(), 'users/alice'), { [key]: 'x' }));
    },
  );

  it('owner cannot add or remove protected fields alongside allowed ones', async () => {
    await assertFails(updateDoc(doc(alice(), 'users/alice'), { displayName: 'Al', credits: 9999 }));
  });

  it('other user cannot update', async () => {
    await assertFails(updateDoc(doc(bob(), 'users/alice'), { displayName: 'Mallory' }));
  });

  it('nobody creates or deletes a user doc from the client', async () => {
    await assertFails(
      setDoc(doc(env.authenticatedContext('carol').firestore(), 'users/carol'), USER_DOC),
    );
    await assertFails(deleteDoc(doc(alice(), 'users/alice')));
    await assertFails(setDoc(doc(anon(), 'users/dave'), USER_DOC));
  });

  it('property: update allowed iff changed keys are within the allowed set', async () => {
    const allowed = ['displayName', 'photoURL', 'settings', 'lastSeenAt'];
    const keys = [...allowed, 'credits', 'plan', 'schemaVersion', 'createdAt', 'email'];
    await fc.assert(
      fc.asyncProperty(fc.subarray(keys, { minLength: 1 }), async (changed) => {
        const patch = Object.fromEntries(changed.map((k) => [k, `v-${k}-${Math.random()}`]));
        const ok = changed.every((k) => allowed.includes(k));
        const result = updateDoc(doc(alice(), 'users/alice'), patch);
        if (ok) await assertSucceeds(result);
        else await assertFails(result);
        return true;
      }),
      { numRuns: 30 },
    );
  });
});

describe('server-only owner subcollections', () => {
  it('owner reads ledger and usage; other and anonymous cannot', async () => {
    await assertSucceeds(getDoc(doc(alice(), 'users/alice/credits/signup')));
    await assertSucceeds(getDoc(doc(alice(), 'users/alice/usage/e1')));
    await assertFails(getDoc(doc(bob(), 'users/alice/credits/signup')));
    await assertFails(getDoc(doc(bob(), 'users/alice/usage/e1')));
    await assertFails(getDoc(doc(anon(), 'users/alice/credits/signup')));
  });

  it('clients cannot write ledger or usage, even the owner', async () => {
    await assertFails(
      setDoc(doc(alice(), 'users/alice/credits/tx2'), { delta: 1000, balanceAfter: 1020 }),
    );
    await assertFails(updateDoc(doc(alice(), 'users/alice/credits/signup'), { delta: 999 }));
    await assertFails(deleteDoc(doc(alice(), 'users/alice/credits/signup')));
    await assertFails(setDoc(doc(alice(), 'users/alice/usage/e2'), { task: 'x' }));
    await assertFails(deleteDoc(doc(alice(), 'users/alice/usage/e1')));
  });

  it('brandKits and styles are owner read/write only', async () => {
    await assertSucceeds(setDoc(doc(alice(), 'users/alice/brandKits/b2'), { name: 'New' }));
    await assertSucceeds(getDoc(doc(alice(), 'users/alice/brandKits/b1')));
    await assertSucceeds(setDoc(doc(alice(), 'users/alice/styles/s1'), { name: 'Mine' }));
    await assertSucceeds(deleteDoc(doc(alice(), 'users/alice/brandKits/b1')));
    await assertFails(getDoc(doc(bob(), 'users/alice/brandKits/b1')));
    await assertFails(setDoc(doc(bob(), 'users/alice/styles/s2'), { name: 'x' }));
    await assertFails(setDoc(doc(anon(), 'users/alice/styles/s2'), { name: 'x' }));
  });

  it('owner reads daily limits; other and anonymous cannot', async () => {
    await assertSucceeds(getDoc(doc(alice(), `users/alice/limits/${DAY}`)));
    await assertFails(getDoc(doc(bob(), `users/alice/limits/${DAY}`)));
    await assertFails(getDoc(doc(anon(), `users/alice/limits/${DAY}`)));
  });
  it('nobody creates, updates or deletes daily limits from the client', async () => {
    const fresh = { ...LIMITS, planCloud: 0 };
    await assertFails(setDoc(doc(alice(), 'users/alice/limits/2026-11-16'), fresh));
    await assertFails(setDoc(doc(alice(), `users/alice/limits/${DAY}`), fresh));
    await assertFails(updateDoc(doc(alice(), `users/alice/limits/${DAY}`), { planCloud: 0 }));
    await assertFails(deleteDoc(doc(alice(), `users/alice/limits/${DAY}`)));
    await assertFails(setDoc(doc(bob(), 'users/alice/limits/2026-11-16'), fresh));
    await assertFails(setDoc(doc(bob(), 'users/bob/limits/2026-11-16'), fresh));
    await assertFails(deleteDoc(doc(bob(), `users/alice/limits/${DAY}`)));
    await assertFails(setDoc(doc(anon(), 'users/alice/limits/2026-11-16'), fresh));
  });
  it('unknown subcollections are denied', async () => {
    await assertFails(setDoc(doc(alice(), 'users/alice/secrets/x'), { a: 1 }));
  });
});

describe('projects', () => {
  it('owner creates with own ownerId; someone else’s ownerId is denied', async () => {
    await assertSucceeds(setDoc(doc(alice(), 'projects/p2'), { ...PROJECT, ownerId: 'alice' }));
    await assertFails(setDoc(doc(alice(), 'projects/p3'), { ...PROJECT, ownerId: 'bob' }));
    await assertFails(setDoc(doc(anon(), 'projects/p4'), { ...PROJECT, ownerId: 'alice' }));
  });

  it('owner reads, updates and deletes; ownerId cannot change', async () => {
    await assertSucceeds(getDoc(doc(alice(), 'projects/p1')));
    await assertSucceeds(updateDoc(doc(alice(), 'projects/p1'), { title: 'Renamed' }));
    await assertFails(updateDoc(doc(alice(), 'projects/p1'), { ownerId: 'bob' }));
    await assertSucceeds(deleteDoc(doc(alice(), 'projects/p1')));
  });

  it('other user and anonymous cannot read, update or delete', async () => {
    await assertFails(getDoc(doc(bob(), 'projects/p1')));
    await assertFails(updateDoc(doc(bob(), 'projects/p1'), { title: 'Hacked' }));
    await assertFails(deleteDoc(doc(bob(), 'projects/p1')));
    await assertFails(getDoc(doc(anon(), 'projects/p1')));
  });

  it('other user cannot take over a project by overwriting it', async () => {
    await assertFails(setDoc(doc(bob(), 'projects/p1'), { ...PROJECT, ownerId: 'bob' }));
  });

  it('owner reads and writes subcollections', async () => {
    await assertSucceeds(getDoc(doc(alice(), 'projects/p1/slots/s1')));
    await assertSucceeds(setDoc(doc(alice(), 'projects/p1/slots/s2'), { startMs: 0 }));
    await assertSucceeds(setDoc(doc(alice(), 'projects/p1/versions/v1'), { slotId: 's1' }));
    await assertSucceeds(setDoc(doc(alice(), 'projects/p1/chat/m1'), { role: 'user' }));
    await assertSucceeds(setDoc(doc(alice(), 'projects/p1/transcript/main'), { words: [] }));
    await assertSucceeds(deleteDoc(doc(alice(), 'projects/p1/slots/s1')));
  });

  it('other user and anonymous cannot touch subcollections', async () => {
    await assertFails(getDoc(doc(bob(), 'projects/p1/slots/s1')));
    await assertFails(setDoc(doc(bob(), 'projects/p1/slots/s2'), { startMs: 0 }));
    await assertFails(deleteDoc(doc(bob(), 'projects/p1/slots/s1')));
    await assertFails(getDoc(doc(anon(), 'projects/p1/slots/s1')));
  });

  it('subcollection writes under a missing project are denied', async () => {
    await assertFails(setDoc(doc(alice(), 'projects/ghost/slots/s1'), { startMs: 0 }));
  });
});

describe('renders and shares (server only)', () => {
  it('owner reads own render; others cannot', async () => {
    await assertSucceeds(getDoc(doc(alice(), 'renders/r1')));
    await assertFails(getDoc(doc(bob(), 'renders/r1')));
    await assertFails(getDoc(doc(anon(), 'renders/r1')));
  });

  it('clients cannot write renders', async () => {
    await assertFails(setDoc(doc(alice(), 'renders/r2'), { ownerId: 'alice', status: 'done' }));
    await assertFails(updateDoc(doc(alice(), 'renders/r1'), { status: 'queued' }));
    await assertFails(deleteDoc(doc(alice(), 'renders/r1')));
  });

  it('shares are fully denied to clients', async () => {
    await assertFails(getDoc(doc(alice(), 'shares/sh1')));
    await assertFails(setDoc(doc(alice(), 'shares/sh2'), { ownerId: 'alice' }));
    await assertFails(getDoc(doc(anon(), 'shares/sh1')));
  });
});

describe('everything else', () => {
  it('unknown top-level collections are denied', async () => {
    await assertFails(getDoc(doc(alice(), 'misc/x')));
    await assertFails(setDoc(doc(alice(), 'misc/x'), { a: 1 }));
    expect(true).toBe(true);
  });
});
