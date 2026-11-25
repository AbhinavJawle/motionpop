// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BYOK_KEY_STORAGE,
  BYOK_MODE_STORAGE,
  BYOK_MODEL_STORAGE,
  clearByokKey,
  getByokKey,
  getByokModel,
  getByokModelMode,
  isByokActive,
  maskApiKey,
  setByokKey,
  setByokModel,
  setByokModelMode,
  subscribeByok,
} from './byok';

const VALID_KEY = 'AIzaSyTestBrowserKey1234567890';

beforeEach(() => {
  window.localStorage.clear();
  clearByokKey();
  setByokModelMode('balanced');
});

describe('browser BYOK store', () => {
  it('starts inactive when no key is stored', () => {
    expect(isByokActive()).toBe(false);
    expect(getByokKey()).toBeNull();
    expect(getByokModelMode()).toBe('balanced');
  });

  it('validates keys with Zod and rejects malformed values', () => {
    expect(setByokKey('too-short')).toMatchObject({ ok: false });
    expect(setByokKey('AIzaSy with spaces inside 12345678')).toMatchObject({ ok: false });
    expect(isByokActive()).toBe(false);
  });

  it('saves, masks, notifies subscribers, and clears cleanly', () => {
    const onChange = vi.fn();
    const unsub = subscribeByok(onChange);

    expect(setByokKey(`  ${VALID_KEY}  `)).toEqual({ ok: true });
    expect(isByokActive()).toBe(true);
    expect(getByokKey()).toBe(VALID_KEY);
    expect(window.localStorage.getItem(BYOK_KEY_STORAGE)).toBe(VALID_KEY);
    expect(maskApiKey(VALID_KEY)).toBe('AIza••••7890');
    expect(onChange).toHaveBeenCalledTimes(1);

    setByokModelMode('flash');
    expect(getByokModelMode()).toBe('flash');
    expect(window.localStorage.getItem(BYOK_MODE_STORAGE)).toBe('flash');
    expect(onChange).toHaveBeenCalledTimes(2);

    setByokModel('gemini-4-neon');
    expect(getByokModel()).toBe('gemini-4-neon');
    expect(window.localStorage.getItem(BYOK_MODEL_STORAGE)).toBe('gemini-4-neon');
    expect(onChange).toHaveBeenCalledTimes(3);

    clearByokKey();
    expect(isByokActive()).toBe(false);
    expect(getByokKey()).toBeNull();
    expect(getByokModel()).toBeNull();
    expect(window.localStorage.getItem(BYOK_KEY_STORAGE)).toBeNull();
    expect(window.localStorage.getItem(BYOK_MODEL_STORAGE)).toBeNull();
    expect(onChange).toHaveBeenCalledTimes(4);

    unsub();
  });
});
