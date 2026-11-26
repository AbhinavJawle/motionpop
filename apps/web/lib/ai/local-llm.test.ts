// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearLocalLlmConfig,
  getLocalLlmConfig,
  isLocalLlmActive,
  LOCAL_LLM_STORAGE,
  saveLocalLlmConfig,
  setLocalLlmEnabled,
  subscribeLocalLlm,
} from './local-llm';

beforeEach(() => {
  window.localStorage.clear();
  clearLocalLlmConfig();
});

describe('browser local LLM store', () => {
  it('starts inactive when unconfigured', () => {
    expect(isLocalLlmActive()).toBe(false);
    expect(getLocalLlmConfig()).toBeNull();
  });

  it('validates URL and model with Zod and rejects invalid values', () => {
    expect(
      saveLocalLlmConfig({
        enabled: true,
        baseUrl: 'javascript:alert(1)',
        model: 'qwen3:8b',
      }),
    ).toMatchObject({ ok: false });

    expect(
      saveLocalLlmConfig({
        enabled: true,
        baseUrl: 'http://localhost:11434',
        model: '   ',
      }),
    ).toMatchObject({ ok: false });

    expect(isLocalLlmActive()).toBe(false);
  });

  it('normalizes URL, saves, notifies subscribers, pauses/resumes, and clears cleanly', () => {
    const onChange = vi.fn();
    const unsub = subscribeLocalLlm(onChange);

    const saved = saveLocalLlmConfig({
      enabled: true,
      preset: 'ollama',
      baseUrl: 'http://localhost:11434/',
      model: 'qwen3:8b',
    });
    expect(saved).toEqual({
      ok: true,
      config: {
        preset: 'ollama',
        baseUrl: 'http://localhost:11434/v1',
        model: 'qwen3:8b',
        apiKey: null,
      },
    });
    expect(isLocalLlmActive()).toBe(true);
    expect(window.localStorage.getItem(LOCAL_LLM_STORAGE)).toContain('qwen3:8b');
    expect(onChange).toHaveBeenCalledTimes(1);

    expect(setLocalLlmEnabled(false)).toBe(true);
    expect(isLocalLlmActive()).toBe(false);
    expect(onChange).toHaveBeenCalledTimes(2);

    expect(setLocalLlmEnabled(true)).toBe(true);
    expect(isLocalLlmActive()).toBe(true);
    expect(getLocalLlmConfig()?.model).toBe('qwen3:8b');
    expect(onChange).toHaveBeenCalledTimes(3);

    clearLocalLlmConfig();
    expect(isLocalLlmActive()).toBe(false);
    expect(getLocalLlmConfig()).toBeNull();
    expect(window.localStorage.getItem(LOCAL_LLM_STORAGE)).toBeNull();
    expect(onChange).toHaveBeenCalledTimes(4);

    unsub();
  });
});
