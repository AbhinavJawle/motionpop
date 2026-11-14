import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { getBytes, ref, uploadBytes } from 'firebase/storage';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { createEnv } from './helpers';

let env: RulesTestEnvironment;

const MB = 1024 * 1024;
const bytes = (n: number) => new Uint8Array(n);

beforeAll(async () => {
  env = await createEnv({ storage: true });
});
afterAll(async () => {
  await env.cleanup();
});
beforeEach(async () => {
  await env.clearStorage();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const s = ctx.storage();
    await uploadBytes(ref(s, 'users/alice/audio/a.mp3'), bytes(10), { contentType: 'audio/mpeg' });
    await uploadBytes(ref(s, 'users/alice/brand/logo.png'), bytes(10), {
      contentType: 'image/png',
    });
    await uploadBytes(ref(s, 'users/alice/media/m.png'), bytes(10), { contentType: 'image/png' });
    await uploadBytes(ref(s, 'users/alice/projects/p1/renders/out.mp4'), bytes(10), {
      contentType: 'video/mp4',
    });
  });
});

const alice = () => env.authenticatedContext('alice').storage();
const bob = () => env.authenticatedContext('bob').storage();
const anon = () => env.unauthenticatedContext().storage();

describe('audio', () => {
  it('owner reads; other and anonymous cannot', async () => {
    await assertSucceeds(getBytes(ref(alice(), 'users/alice/audio/a.mp3')));
    await assertFails(getBytes(ref(bob(), 'users/alice/audio/a.mp3')));
    await assertFails(getBytes(ref(anon(), 'users/alice/audio/a.mp3')));
  });

  it('allows exactly 50 MB and rejects one byte more', async () => {
    await assertSucceeds(
      uploadBytes(ref(alice(), 'users/alice/audio/limit.wav'), bytes(50 * MB), {
        contentType: 'audio/wav',
      }),
    );
    await assertFails(
      uploadBytes(ref(alice(), 'users/alice/audio/over.wav'), bytes(50 * MB + 1), {
        contentType: 'audio/wav',
      }),
    );
  });

  it('rejects non-audio content types', async () => {
    await assertFails(
      uploadBytes(ref(alice(), 'users/alice/audio/x.png'), bytes(10), { contentType: 'image/png' }),
    );
    await assertFails(uploadBytes(ref(alice(), 'users/alice/audio/x.bin'), bytes(10)));
  });

  it('denies writes to another user’s path and when signed out', async () => {
    await assertFails(
      uploadBytes(ref(bob(), 'users/alice/audio/b.mp3'), bytes(10), { contentType: 'audio/mpeg' }),
    );
    await assertFails(
      uploadBytes(ref(anon(), 'users/alice/audio/c.mp3'), bytes(10), { contentType: 'audio/mpeg' }),
    );
  });
});

describe.each(['brand', 'media'])('%s images', (folder) => {
  it('owner reads; other user cannot', async () => {
    const path = folder === 'brand' ? 'users/alice/brand/logo.png' : 'users/alice/media/m.png';
    await assertSucceeds(getBytes(ref(alice(), path)));
    await assertFails(getBytes(ref(bob(), path)));
  });

  it('allows exactly 10 MB and rejects one byte more', async () => {
    await assertSucceeds(
      uploadBytes(ref(alice(), `users/alice/${folder}/limit.png`), bytes(10 * MB), {
        contentType: 'image/png',
      }),
    );
    await assertFails(
      uploadBytes(ref(alice(), `users/alice/${folder}/over.png`), bytes(10 * MB + 1), {
        contentType: 'image/png',
      }),
    );
  });

  it('rejects non-image types and other users', async () => {
    await assertFails(
      uploadBytes(ref(alice(), `users/alice/${folder}/x.mp3`), bytes(10), {
        contentType: 'audio/mpeg',
      }),
    );
    await assertFails(
      uploadBytes(ref(bob(), `users/alice/${folder}/y.png`), bytes(10), {
        contentType: 'image/png',
      }),
    );
  });
});

describe('renders and everything else', () => {
  it('owner reads renders; other user cannot', async () => {
    await assertSucceeds(getBytes(ref(alice(), 'users/alice/projects/p1/renders/out.mp4')));
    await assertFails(getBytes(ref(bob(), 'users/alice/projects/p1/renders/out.mp4')));
    await assertFails(getBytes(ref(anon(), 'users/alice/projects/p1/renders/out.mp4')));
  });

  it('client writes to renders are denied, even for the owner', async () => {
    await assertFails(
      uploadBytes(ref(alice(), 'users/alice/projects/p1/renders/new.mp4'), bytes(10), {
        contentType: 'video/mp4',
      }),
    );
  });

  it('unknown paths are denied', async () => {
    await assertFails(
      uploadBytes(ref(alice(), 'users/alice/other/x.png'), bytes(10), { contentType: 'image/png' }),
    );
    await assertFails(
      uploadBytes(ref(alice(), 'public/x.png'), bytes(10), { contentType: 'image/png' }),
    );
    await assertFails(getBytes(ref(alice(), 'public/x.png')));
  });
});
