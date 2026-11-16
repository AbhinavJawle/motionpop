import { describe, expect, it } from 'vitest';
import { offlineOnly, renderMode } from './mode.server';

describe('offlineOnly (R7.4)', () => {
  it('answers 404 in production, in emulator mode and with Firebase configured', async () => {
    for (const env of [
      { NODE_ENV: 'production' },
      { NODE_ENV: 'production', MP_RENDER_MODE: 'offline' },
      { NODE_ENV: 'development', FIRESTORE_EMULATOR_HOST: 'x:1' },
      {
        NODE_ENV: 'development',
        NEXT_PUBLIC_FIREBASE_API_KEY: 'k',
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'p',
      },
    ]) {
      const res = offlineOnly(env);
      expect(res?.status, JSON.stringify(env)).toBe(404);
    }
  });

  it('lets the request through only in offline mode', () => {
    const env = { NODE_ENV: 'development' };
    expect(renderMode(env)).toBe('offline');
    expect(offlineOnly(env)).toBeNull();
  });
});
