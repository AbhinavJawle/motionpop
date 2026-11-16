import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Availability } from './ai-status';
import {
  CLOUD_BODY,
  CLOUD_TITLE,
  OFFLINE_BANNER,
  READY_BODY,
  READY_TITLE,
  SESSION_KEY,
  claimSessionToast,
  progressLabel,
  toastFor,
  toastsQuiet,
  type SessionStore,
} from './availability';

const AVAIL: Availability[] = [
  'checking',
  'available',
  'downloadable',
  'downloading',
  'unavailable',
];

describe('toastFor', () => {
  it('shows one availability toast per outcome, with the cloud one offering setup only when downloadable', () => {
    expect(toastFor('checking', 'available', false)).toEqual({ kind: 'ready', afterSetup: false });
    expect(toastFor('checking', 'unavailable', false)).toEqual({ kind: 'cloud', setup: false });
    expect(toastFor('checking', 'downloadable', false)).toEqual({ kind: 'cloud', setup: true });
    expect(toastFor(null, 'available', false)).toEqual({ kind: 'ready', afterSetup: false });
  });

  it('never says anything while checking or when nothing changed', () => {
    for (const a of AVAIL) {
      expect(toastFor(a, 'checking', false)).toBeNull();
      expect(toastFor(a, a, false)).toBeNull();
    }
  });

  it('the session flag silences the availability toasts only', () => {
    expect(toastFor('checking', 'available', true)).toBeNull();
    expect(toastFor('checking', 'unavailable', true)).toBeNull();
    expect(toastFor('checking', 'downloadable', true)).toBeNull();
    expect(toastFor('downloadable', 'downloading', true)).toEqual({ kind: 'progress' });
    expect(toastFor('downloading', 'available', true)).toEqual({ kind: 'ready', afterSetup: true });
    expect(toastFor('downloading', 'downloadable', true)).toEqual({ kind: 'setup-failed' });
  });

  it('a download found at startup shows progress, then the mint toast when it ends', () => {
    expect(toastFor('checking', 'downloading', false)).toEqual({ kind: 'progress' });
    expect(toastFor('downloading', 'available', false)).toEqual({
      kind: 'ready',
      afterSetup: true,
    });
  });

  it('property: a toast is never a mint "ready" unless the model is available now', () => {
    fc.assert(
      fc.property(
        fc.option(fc.constantFrom(...AVAIL), { nil: null }),
        fc.constantFrom(...AVAIL),
        fc.boolean(),
        (prev, next, shown) => {
          const t = toastFor(prev, next, shown);
          if (t?.kind === 'ready') expect(next).toBe('available');
          if (t?.kind === 'cloud')
            expect(next === 'unavailable' || next === 'downloadable').toBe(true);
          if (t?.kind === 'cloud') expect(t.setup).toBe(next === 'downloadable');
          if (t?.kind === 'progress') expect(next).toBe('downloading');
          if (shown && t)
            expect(
              ['progress', 'setup-failed'].includes(t.kind) || (t.kind === 'ready' && t.afterSetup),
            ).toBe(true);
        },
      ),
      { numRuns: 400 },
    );
  });
});

describe('copy', () => {
  it('uses the exact strings of screens.md', () => {
    expect(`${READY_TITLE} · ${READY_BODY}`).toBe(
      'On-device AI ready · Small edits run instantly on your device, free and private.',
    );
    expect(`${CLOUD_TITLE} · ${CLOUD_BODY}`).toBe(
      "Using cloud AI · Your browser doesn't support on-device AI yet. Everything still works.",
    );
    expect(OFFLINE_BANNER).toBe(
      "You're offline. On-device edits still work. New graphics will generate when you're back.",
    );
  });

  it('formats progress as a whole percent, clamped', () => {
    expect(progressLabel(0.34)).toBe('Setting up on-device AI · 34 %');
    expect(progressLabel(0.7262)).toBe('Setting up on-device AI · 73 %');
    expect(progressLabel(null)).toBe('Setting up on-device AI · 0 %');
    expect(progressLabel(7)).toBe('Setting up on-device AI · 100 %');
    expect(progressLabel(-1)).toBe('Setting up on-device AI · 0 %');
    expect(progressLabel(Number.NaN)).toBe('Setting up on-device AI · 0 %');
  });
});

describe('claimSessionToast', () => {
  const memory = (): SessionStore & { data: Map<string, string> } => {
    const data = new Map<string, string>();
    return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
  };

  it('is true once per session, then false', () => {
    const s = memory();
    expect(claimSessionToast(s)).toBe(true);
    expect(s.data.get(SESSION_KEY)).toBe('1');
    expect(claimSessionToast(s)).toBe(false);
    expect(claimSessionToast(s)).toBe(false);
  });

  it('shows the toast when storage is missing or throws', () => {
    expect(claimSessionToast(undefined)).toBe(true);
    const broken: SessionStore = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    };
    expect(claimSessionToast(broken)).toBe(true);
  });
});

describe('toastsQuiet', () => {
  it('local mode has no cloud, so no "Using cloud AI" toast', () => {
    expect(toastsQuiet({ firebase: false, fakeAi: false, search: '' })).toBe(true);
    expect(toastsQuiet({ firebase: true, fakeAi: false, search: '' })).toBe(false);
  });

  it('the fake-AI flag stays quiet unless the URL asks for the toasts', () => {
    expect(toastsQuiet({ firebase: false, fakeAi: true, search: '' })).toBe(true);
    expect(toastsQuiet({ firebase: false, fakeAi: true, search: '?t=5600&select=slot-2' })).toBe(
      true,
    );
    expect(toastsQuiet({ firebase: false, fakeAi: true, search: '?aiToasts=1' })).toBe(false);
  });
});
