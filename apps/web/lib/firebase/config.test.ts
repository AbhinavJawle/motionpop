import { describe, expect, it } from 'vitest';
import { parseFirebaseEnv, type RawFirebaseEnv } from './config';

const full: RawFirebaseEnv = {
  apiKey: 'key',
  authDomain: 'demo.firebaseapp.com',
  projectId: 'demo',
  storageBucket: 'demo.firebasestorage.app',
  messagingSenderId: '123',
  appId: '1:123:web:abc',
};

describe('parseFirebaseEnv', () => {
  it('returns the config when every required value is present', () => {
    const env = parseFirebaseEnv(full);
    expect(env?.config.projectId).toBe('demo');
    expect(env?.useEmulators).toBe(false);
    expect(env?.aiBackend).toBe('vertex');
    expect(env).not.toHaveProperty('recaptchaSiteKey');
  });

  it('returns null when any required value is missing or blank', () => {
    expect(parseFirebaseEnv({})).toBeNull();
    expect(parseFirebaseEnv({ ...full, apiKey: '  ' })).toBeNull();
    expect(parseFirebaseEnv({ ...full, appId: undefined })).toBeNull();
  });

  it('reads optional App Check values and the emulator flag', () => {
    const env = parseFirebaseEnv({
      ...full,
      recaptchaSiteKey: 'site',
      appCheckDebugToken: 'dbg',
      useEmulators: ' TRUE ',
    });
    expect(env?.recaptchaSiteKey).toBe('site');
    expect(env?.appCheckDebugToken).toBe('dbg');
    expect(env?.useEmulators).toBe(true);
  });

  it('selects the Gemini Developer API backend only when asked', () => {
    expect(parseFirebaseEnv({ ...full, aiBackend: 'Google' })?.aiBackend).toBe('google');
    expect(parseFirebaseEnv({ ...full, aiBackend: 'other' })?.aiBackend).toBe('vertex');
  });

  it('treats anything other than "true" as emulators off', () => {
    expect(parseFirebaseEnv({ ...full, useEmulators: '1' })?.useEmulators).toBe(false);
  });
});
