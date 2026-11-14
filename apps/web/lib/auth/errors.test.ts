import { describe, expect, it } from 'vitest';
import { authErrorCode, authErrorMessage, GENERIC_AUTH_ERROR } from './errors';

const err = (code: string) => Object.assign(new Error('Firebase: x'), { code });

describe('authErrorMessage', () => {
  it('maps known codes to friendly copy', () => {
    expect(authErrorMessage(err('auth/invalid-credential'))).toMatch(/don’t match/);
    expect(authErrorMessage(err('auth/email-already-in-use'))).toMatch(/Sign in instead/);
    expect(authErrorMessage(err('auth/network-request-failed'))).toMatch(/Needs connection/);
  });

  it('hides wrong-password vs unknown-user differences', () => {
    expect(authErrorMessage(err('auth/user-not-found'))).toBe(
      authErrorMessage(err('auth/wrong-password')),
    );
  });

  it('stays silent when the user closes the Google window', () => {
    expect(authErrorMessage(err('auth/popup-closed-by-user'))).toBeNull();
    expect(authErrorMessage(err('auth/cancelled-popup-request'))).toBeNull();
  });

  it('falls back to a generic line and never leaks the raw code', () => {
    expect(authErrorMessage(err('auth/some-new-code'))).toBe(GENERIC_AUTH_ERROR);
    expect(authErrorMessage(new Error('boom'))).toBe(GENERIC_AUTH_ERROR);
    expect(authErrorMessage('nope')).toBe(GENERIC_AUTH_ERROR);
  });

  it('reads codes only from objects with a string code', () => {
    expect(authErrorCode({ code: 42 })).toBeNull();
    expect(authErrorCode(null)).toBeNull();
    expect(authErrorCode(err('auth/x'))).toBe('auth/x');
  });
});
