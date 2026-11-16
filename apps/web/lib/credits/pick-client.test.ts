import { describe, expect, it } from 'vitest';
import { fakeAiFlag, pickCreditsClient } from './pick-client';

describe('pickCreditsClient (spec 09 credits seam table)', () => {
  const cases: [string, Parameters<typeof pickCreditsClient>[0], string, boolean][] = [
    ['local mode', { firebaseEnabled: false, fakeAi: false, signedIn: false }, 'local', false],
    [
      'fake AI, no Firebase',
      { firebaseEnabled: false, fakeAi: true, signedIn: false },
      'local',
      true,
    ],
    [
      'fake AI with Firebase',
      { firebaseEnabled: true, fakeAi: true, signedIn: true },
      'local',
      true,
    ],
    [
      'Firebase, signed out',
      { firebaseEnabled: true, fakeAi: false, signedIn: false },
      'none',
      false,
    ],
    [
      'Firebase, signed in',
      { firebaseEnabled: true, fakeAi: false, signedIn: true },
      'server',
      true,
    ],
  ];
  it.each(cases)('%s', (_n, input, client, cloud) => {
    const p = pickCreditsClient(input);
    expect(p.client).toBe(client);
    expect(p.cloudAvailable).toBe(cloud);
    if (!cloud) expect(p.cloudBlockedReason).toBe('Sign in to use cloud AI');
  });

  it('never gives a hosted build with Firebase LocalCredits unless the fake-AI flag is on', () => {
    for (const signedIn of [true, false]) {
      expect(pickCreditsClient({ firebaseEnabled: true, fakeAi: false, signedIn }).client).not.toBe(
        'local',
      );
    }
  });

  it('the fake-AI flag is ignored in production builds', () => {
    expect(fakeAiFlag({ NODE_ENV: 'production', NEXT_PUBLIC_FAKE_AI: '1' })).toBe(false);
    expect(fakeAiFlag({ NODE_ENV: 'development', NEXT_PUBLIC_FAKE_AI: '1' })).toBe(true);
    expect(fakeAiFlag({ NODE_ENV: 'development', NEXT_PUBLIC_FAKE_AI: '0' })).toBe(false);
  });
});
