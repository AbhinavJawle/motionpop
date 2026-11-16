// @vitest-environment happy-dom
import { DEFAULT_USER_SETTINGS } from '@motionpop/schemas';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  auth: { status: 'local' } as unknown,
  credits: { balance: null, plan: null, settings: null } as { settings: unknown },
  updateDoc: vi.fn(),
  toastError: vi.fn(),
  stored: null as unknown,
}));
vi.mock('../auth/auth-provider', () => ({ useAuth: () => h.auth }));
vi.mock('../credits/use-credits', () => ({ useCredits: () => h.credits }));
vi.mock('../credits/firestore-listen', () => ({
  userStore: { get: () => ({ balance: 1, plan: 'free', settings: h.stored ?? null }) },
}));
vi.mock('../firebase/client', () => ({ getDb: () => Promise.resolve({}) }));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...path: string[]) => path.join('/'),
  updateDoc: (...a: unknown[]) => h.updateDoc(...a),
}));
vi.mock('sonner', () => ({ toast: { error: h.toastError } }));

import {
  LOCAL_SETTINGS_KEY,
  SAVE_FAILED_COPY,
  parseLocalSettings,
  usePreferOnDevice,
} from './use-prefer-on-device';

beforeEach(() => {
  window.localStorage.clear();
  h.auth = { status: 'local' };
  h.credits = { settings: null };
  h.stored = null;
  h.updateDoc.mockReset();
  h.toastError.mockClear();
});
afterEach(cleanup);

describe('parseLocalSettings', () => {
  it('defaults to on and survives junk', () => {
    expect(parseLocalSettings(null).preferOnDevice).toBe(true);
    expect(parseLocalSettings('not json').preferOnDevice).toBe(true);
    expect(parseLocalSettings('{"preferOnDevice":"no"}').preferOnDevice).toBe(true);
    expect(parseLocalSettings('{"preferOnDevice":false}').preferOnDevice).toBe(false);
  });
});

describe('usePreferOnDevice', () => {
  it('local mode: defaults on, saves to localStorage and updates the value', async () => {
    const { result } = renderHook(() => usePreferOnDevice());
    expect(result.current.preferOnDevice).toBe(true);
    await act(async () => {
      expect(await result.current.save(false)).toBe(true);
    });
    expect(result.current.preferOnDevice).toBe(false);
    expect(JSON.parse(window.localStorage.getItem(LOCAL_SETTINGS_KEY) ?? '{}')).toMatchObject({
      preferOnDevice: false,
    });
  });

  it('signed in: reads the saved value and writes the WHOLE settings map (the rules need it)', async () => {
    h.auth = { status: 'signed-in', user: { uid: 'u1' } };
    h.credits = {
      settings: { ...DEFAULT_USER_SETTINGS, defaultFormat: '9:16', preferOnDevice: false },
    };
    h.stored = { ...DEFAULT_USER_SETTINGS, defaultFormat: '9:16', preferOnDevice: false };
    h.updateDoc.mockResolvedValue(undefined);
    const { result } = renderHook(() => usePreferOnDevice());
    expect(result.current.preferOnDevice).toBe(false);
    expect(result.current.loaded).toBe(true);
    await act(async () => {
      await result.current.save(true);
    });
    expect(h.updateDoc).toHaveBeenCalledWith('users/u1', {
      settings: { ...DEFAULT_USER_SETTINGS, defaultFormat: '9:16', preferOnDevice: true },
    });
  });

  it('a failed write toasts "Couldn\'t save that setting." and reports false; the value stays the saved one', async () => {
    h.auth = { status: 'signed-in', user: { uid: 'u1' } };
    h.credits = { settings: DEFAULT_USER_SETTINGS };
    h.updateDoc.mockRejectedValue(new Error('permission-denied'));
    const { result } = renderHook(() => usePreferOnDevice());
    await act(async () => {
      expect(await result.current.save(false)).toBe(false);
    });
    expect(h.toastError).toHaveBeenCalledWith(SAVE_FAILED_COPY);
    expect(result.current.preferOnDevice).toBe(true);
  });

  it('signed in but the doc is not loaded yet: not loaded, default on', () => {
    h.auth = { status: 'signed-in', user: { uid: 'u1' } };
    const { result } = renderHook(() => usePreferOnDevice());
    expect(result.current).toMatchObject({ preferOnDevice: true, loaded: false });
  });
});
