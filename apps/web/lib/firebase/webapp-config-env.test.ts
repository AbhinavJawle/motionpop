import { describe, expect, it } from 'vitest';
import { webappConfigEnv } from './webapp-config-env';

const config = JSON.stringify({
  apiKey: 'k',
  authDomain: 'demo.firebaseapp.com',
  projectId: 'demo',
  storageBucket: 'demo.firebasestorage.app',
  messagingSenderId: '1',
  appId: '1:1:web:a',
});

describe('webappConfigEnv', () => {
  it('maps FIREBASE_WEBAPP_CONFIG onto NEXT_PUBLIC names', () => {
    expect(webappConfigEnv({ FIREBASE_WEBAPP_CONFIG: config })).toEqual({
      NEXT_PUBLIC_FIREBASE_API_KEY: 'k',
      NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'demo.firebaseapp.com',
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'demo',
      NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: 'demo.firebasestorage.app',
      NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '1',
      NEXT_PUBLIC_FIREBASE_APP_ID: '1:1:web:a',
    });
  });

  it('lets explicitly set env win, including blanks (e2e local mode)', () => {
    const out = webappConfigEnv({
      FIREBASE_WEBAPP_CONFIG: config,
      NEXT_PUBLIC_FIREBASE_API_KEY: '',
    });
    expect(out.NEXT_PUBLIC_FIREBASE_API_KEY).toBeUndefined();
  });

  it('ignores missing or malformed config', () => {
    expect(webappConfigEnv({})).toEqual({});
    expect(webappConfigEnv({ FIREBASE_WEBAPP_CONFIG: '{nope' })).toEqual({});
    expect(webappConfigEnv({ FIREBASE_WEBAPP_CONFIG: '42' })).toEqual({});
  });
});
