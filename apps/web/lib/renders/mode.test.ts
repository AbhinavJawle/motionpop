import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { assertModeAllowed, decideRenderMode, type ModeEnv } from './mode';

const FIREBASE = { NEXT_PUBLIC_FIREBASE_API_KEY: 'k', NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'p' };

describe('decideRenderMode (R7.1)', () => {
  it('is cloud in production', () => {
    expect(decideRenderMode({ NODE_ENV: 'production', ...FIREBASE })).toBe('cloud');
  });

  it('is emulator when the Firestore emulator variable is set', () => {
    expect(
      decideRenderMode({ NODE_ENV: 'development', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' }),
    ).toBe('emulator');
    // Even with the web config present: the emulator wins.
    expect(
      decideRenderMode({
        NODE_ENV: 'test',
        FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
        ...FIREBASE,
      }),
    ).toBe('emulator');
  });

  it('is offline when Firebase is not configured and the app is not in production', () => {
    expect(decideRenderMode({ NODE_ENV: 'development' })).toBe('offline');
    expect(decideRenderMode({})).toBe('offline');
    // Half a config is no config.
    expect(decideRenderMode({ NODE_ENV: 'development', NEXT_PUBLIC_FIREBASE_API_KEY: 'k' })).toBe(
      'offline',
    );
    expect(
      decideRenderMode({
        NODE_ENV: 'development',
        NEXT_PUBLIC_FIREBASE_API_KEY: ' ',
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'p',
      }),
    ).toBe('offline');
  });

  it('is cloud for a developer working against the real project', () => {
    expect(decideRenderMode({ NODE_ENV: 'development', ...FIREBASE })).toBe('cloud');
  });

  it('lets a developer force a mode outside production, and ignores an unknown value', () => {
    expect(
      decideRenderMode({ NODE_ENV: 'development', MP_RENDER_MODE: 'offline', ...FIREBASE }),
    ).toBe('offline');
    expect(decideRenderMode({ NODE_ENV: 'development', MP_RENDER_MODE: 'emulator' })).toBe(
      'emulator',
    );
    expect(decideRenderMode({ NODE_ENV: 'development', MP_RENDER_MODE: 'turbo' })).toBe('offline');
  });
});

describe('P11: production always gives cloud', () => {
  const text = fc.option(fc.string({ maxLength: 12 }), { nil: undefined });
  const envArb: fc.Arbitrary<ModeEnv> = fc.record({
    NODE_ENV: fc.constant('production'),
    FIRESTORE_EMULATOR_HOST: text,
    FIREBASE_AUTH_EMULATOR_HOST: text,
    NEXT_PUBLIC_FIREBASE_API_KEY: text,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: text,
    MP_RENDER_MODE: fc.option(fc.constantFrom('cloud', 'emulator', 'offline', 'x'), {
      nil: undefined,
    }),
  });

  it('whatever the other variables say', () => {
    fc.assert(
      fc.property(envArb, (env) => {
        expect(decideRenderMode(env)).toBe('cloud');
        expect(assertModeAllowed(decideRenderMode(env), env)).toBe('cloud');
      }),
      { numRuns: 300 },
    );
  });

  it('outside production the decision is always one of the three modes', () => {
    fc.assert(
      fc.property(envArb, fc.constantFrom('development', 'test', undefined), (env, node) => {
        expect(['cloud', 'emulator', 'offline']).toContain(
          decideRenderMode({ ...env, NODE_ENV: node }),
        );
      }),
      { numRuns: 200 },
    );
  });

  it('the startup assertion refuses a development mode in production', () => {
    expect(() => assertModeAllowed('offline', { NODE_ENV: 'production' })).toThrow(/production/);
    expect(() => assertModeAllowed('emulator', { NODE_ENV: 'production' })).toThrow(/production/);
    expect(assertModeAllowed('offline', { NODE_ENV: 'development' })).toBe('offline');
  });
});
