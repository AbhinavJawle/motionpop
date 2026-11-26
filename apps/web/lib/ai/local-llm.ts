'use client';

import {
  assertSafeLocalLlmTransport,
  inferLocalLlmPreset,
  LOCAL_LLM_PRESETS,
  LocalLlmApiKeySchema,
  LocalLlmBaseUrlSchema,
  LocalLlmModelSchema,
  LocalLlmPresetSchema,
  type LocalLlmPreset,
} from '@motionpop/ai';
import { useSyncExternalStore } from 'react';
import { z } from 'zod';

/**
 * Browser-local Ollama / LM Studio / OpenAI-compatible server configuration store.
 *
 * Security & privacy guarantees:
 * - Stored strictly in `window.localStorage` under `mp:local-llm-config`.
 * - Never transmitted to Motionpop servers, Firestore, cookies, or URLs.
 * - Cross-tab changes stay in sync via the browser `storage` event.
 */

export const LOCAL_LLM_STORAGE = 'mp:local-llm-config';

const StoredLocalLlmSchema = z.object({
  enabled: z.boolean(),
  preset: LocalLlmPresetSchema,
  baseUrl: LocalLlmBaseUrlSchema,
  model: z.string().trim().max(160),
  apiKey: z.string().trim().max(256).optional(),
});

export interface ActiveLocalLlmConfig {
  preset: LocalLlmPreset;
  baseUrl: string;
  model: string;
  apiKey: string | null;
}

export interface LocalLlmSnapshot {
  /** True when local LLM is enabled AND has a valid server URL + model name. */
  active: boolean;
  /** Whether the user turned the local provider on (may be false while paused). */
  enabled: boolean;
  preset: LocalLlmPreset;
  baseUrl: string;
  model: string | null;
  hasApiKey: boolean;
}

const DEFAULT_BASE_URL = LOCAL_LLM_PRESETS.ollama.defaultBaseUrl;

const SERVER_SNAPSHOT: LocalLlmSnapshot = {
  active: false,
  enabled: false,
  preset: 'ollama',
  baseUrl: DEFAULT_BASE_URL,
  model: null,
  hasApiKey: false,
};

const listeners = new Set<() => void>();
let storageBound = false;
let cachedRaw: string | null | undefined;
let cachedActive: ActiveLocalLlmConfig | null = null;
let cachedSavedApiKey: string | null = null;
let cachedSnapshot: LocalLlmSnapshot = SERVER_SNAPSHOT;

function readStorage(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(LOCAL_LLM_STORAGE);
  } catch {
    return null;
  }
}

function writeStorage(value: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (value === null) window.localStorage.removeItem(LOCAL_LLM_STORAGE);
    else window.localStorage.setItem(LOCAL_LLM_STORAGE, value);
  } catch {
    // Private browsing or quota errors: fail silently without crashing UI.
  }
}

function refreshCache(): void {
  const raw = readStorage();
  if (raw === cachedRaw) return;
  cachedRaw = raw;

  if (!raw) {
    cachedActive = null;
    cachedSavedApiKey = null;
    cachedSnapshot = SERVER_SNAPSHOT;
    return;
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    cachedActive = null;
    cachedSavedApiKey = null;
    cachedSnapshot = SERVER_SNAPSHOT;
    return;
  }

  const parsed = StoredLocalLlmSchema.safeParse(parsedJson);
  if (!parsed.success) {
    cachedActive = null;
    cachedSavedApiKey = null;
    cachedSnapshot = SERVER_SNAPSHOT;
    return;
  }

  const { enabled, preset, baseUrl } = parsed.data;
  const modelParsed = LocalLlmModelSchema.safeParse(parsed.data.model);
  const model = modelParsed.success ? modelParsed.data : null;
  const keyParsed = parsed.data.apiKey
    ? LocalLlmApiKeySchema.safeParse(parsed.data.apiKey)
    : null;
  const apiKey = keyParsed?.success && keyParsed.data.length > 0 ? keyParsed.data : null;
  const active = Boolean(enabled && model);

  cachedSavedApiKey = apiKey;
  cachedActive = active && model ? { preset, baseUrl, model, apiKey } : null;
  cachedSnapshot = {
    active,
    enabled,
    preset,
    baseUrl,
    model,
    hasApiKey: apiKey !== null,
  };
}

function notify(): void {
  cachedRaw = undefined;
  refreshCache();
  listeners.forEach((fn) => fn());
}

function bindStorageListener(): void {
  if (storageBound || typeof window === 'undefined') return;
  storageBound = true;
  window.addEventListener('storage', (e) => {
    if (e.key === null || e.key === LOCAL_LLM_STORAGE) {
      notify();
    }
  });
}

/** Returns the active local LLM config (URL + model) when enabled and valid, else `null`. */
export function getLocalLlmConfig(): ActiveLocalLlmConfig | null {
  if (typeof window === 'undefined') return null;
  refreshCache();
  return cachedActive;
}

/** Returns any saved optional bearer token even while the local provider is paused. */
export function getSavedLocalLlmApiKey(): string | null {
  if (typeof window === 'undefined') return null;
  refreshCache();
  return cachedSavedApiKey;
}

export function isLocalLlmActive(): boolean {
  return getLocalLlmConfig() !== null;
}

/** Validates and saves the browser-local Ollama / LM Studio / custom server configuration. */
export function saveLocalLlmConfig(input: {
  enabled: boolean;
  preset?: LocalLlmPreset;
  baseUrl: string;
  model: string;
  apiKey?: string | null;
}): { ok: true; config: ActiveLocalLlmConfig | null } | { ok: false; message: string } {
  const urlParsed = LocalLlmBaseUrlSchema.safeParse(input.baseUrl);
  if (!urlParsed.success) {
    return {
      ok: false,
      message: urlParsed.error.issues[0]?.message ?? 'Enter a valid local server URL',
    };
  }
  const modelTrimmed = input.model.trim();
  if (input.enabled || modelTrimmed.length > 0) {
    const modelParsed = LocalLlmModelSchema.safeParse(modelTrimmed);
    if (!modelParsed.success) {
      return {
        ok: false,
        message: modelParsed.error.issues[0]?.message ?? 'Select or enter a local model name',
      };
    }
  }
  const keyTrimmed = input.apiKey?.trim() ?? '';
  if (keyTrimmed) {
    const keyParsed = LocalLlmApiKeySchema.safeParse(keyTrimmed);
    if (!keyParsed.success) {
      return {
        ok: false,
        message: keyParsed.error.issues[0]?.message ?? 'Enter a valid optional API key',
      };
    }
    try {
      assertSafeLocalLlmTransport(urlParsed.data, keyParsed.data);
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : 'Insecure transport for API key',
      };
    }
  }

  const preset = input.preset ?? inferLocalLlmPreset(urlParsed.data);
  const stored = {
    enabled: input.enabled,
    preset,
    baseUrl: urlParsed.data,
    model: modelTrimmed,
    ...(keyTrimmed ? { apiKey: keyTrimmed } : {}),
  };
  writeStorage(JSON.stringify(stored));
  notify();
  return { ok: true, config: getLocalLlmConfig() };
}

/** Pauses or resumes a previously saved local LLM config without losing its URL or model. */
export function setLocalLlmEnabled(enabled: boolean): boolean {
  if (typeof window === 'undefined') return false;
  refreshCache();
  const snap = cachedSnapshot;
  if (enabled && !snap.model) return false;
  const raw = readStorage();
  let existingKey: string | undefined;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { apiKey?: string };
      if (typeof parsed.apiKey === 'string') existingKey = parsed.apiKey;
    } catch {
      // ignore
    }
  }
  const res = saveLocalLlmConfig({
    enabled,
    preset: snap.preset,
    baseUrl: snap.baseUrl,
    model: snap.model ?? '',
    apiKey: existingKey,
  });
  return res.ok;
}

/** Clears the local LLM configuration and reverts to BYOK / Firebase AI Logic / on-device. */
export function clearLocalLlmConfig(): void {
  writeStorage(null);
  notify();
}

/** Subscribes to local LLM changes (used by `router-client` to hot-swap the active router). */
export function subscribeLocalLlm(fn: () => void): () => void {
  bindStorageListener();
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function getSnapshot(): LocalLlmSnapshot {
  if (typeof window === 'undefined') return SERVER_SNAPSHOT;
  refreshCache();
  return cachedSnapshot;
}

/** Reactive local LLM status for UI components (SSR & React 19 `useSyncExternalStore` safe). */
export function useLocalLlm(): LocalLlmSnapshot {
  return useSyncExternalStore(subscribeLocalLlm, getSnapshot, () => SERVER_SNAPSHOT);
}
