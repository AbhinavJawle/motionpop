'use client';

import { ByokModelModeSchema, GeminiApiKeySchema, type ByokModelMode } from '@motionpop/ai';
import { useSyncExternalStore } from 'react';

/**
 * Browser-local Gemini API key store (Spec 42 BYOK).
 *
 * Security guarantees:
 * - Lives strictly in `window.localStorage` under `mp:byok-gemini-key`.
 * - Never written to Firestore, cookies, URLs, or Motionpop API routes.
 * - Cross-tab changes sync via the browser `storage` event.
 */

export const BYOK_KEY_STORAGE = 'mp:byok-gemini-key';
export const BYOK_MODE_STORAGE = 'mp:byok-gemini-mode';
export const BYOK_MODEL_STORAGE = 'mp:byok-gemini-model';

export interface ByokSnapshot {
  /** True when a valid Google AI Studio key is saved in this browser. */
  active: boolean;
  /** Masked preview safe for UI display (e.g. `AIza••••9xQp`), or null when unset. */
  maskedKey: string | null;
  /** Preferred Gemini model tier for BYOK cloud calls when no specific model is selected. */
  modelMode: ByokModelMode;
  /** Explicit Gemini model ID picked by the user (e.g. `gemini-2.5-pro`), or null for Auto preset. */
  customModel: string | null;
}

const SERVER_SNAPSHOT: ByokSnapshot = {
  active: false,
  maskedKey: null,
  modelMode: 'balanced',
  customModel: null,
};

const listeners = new Set<() => void>();
let storageBound = false;
let cachedKey: string | null | undefined;
let cachedMode: ByokModelMode | undefined;
let cachedCustomModel: string | null | undefined;
let cachedSnapshot: ByokSnapshot = SERVER_SNAPSHOT;

function readStorage(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Private browsing or quota errors: fail silently without crashing UI.
  }
}

/** Masks an API key for UI display (`AIza••••abcd`). */
export function maskApiKey(key: string): string {
  const trimmed = key.trim();
  if (trimmed.length <= 10) return '••••••••';
  return `${trimmed.slice(0, 4)}••••${trimmed.slice(-4)}`;
}

function refreshCache(): void {
  const rawKey = readStorage(BYOK_KEY_STORAGE);
  const parsedKey = rawKey ? GeminiApiKeySchema.safeParse(rawKey) : null;
  const nextKey = parsedKey?.success ? parsedKey.data : null;

  const rawMode = readStorage(BYOK_MODE_STORAGE);
  const parsedMode = rawMode ? ByokModelModeSchema.safeParse(rawMode) : null;
  const nextMode: ByokModelMode = parsedMode?.success ? parsedMode.data : 'balanced';

  const rawCustom = readStorage(BYOK_MODEL_STORAGE)?.trim() ?? '';
  const nextCustomModel = rawCustom && /^[a-z0-9._-]{2,80}$/i.test(rawCustom) ? rawCustom : null;

  if (cachedKey === nextKey && cachedMode === nextMode && cachedCustomModel === nextCustomModel) {
    return;
  }
  cachedKey = nextKey;
  cachedMode = nextMode;
  cachedCustomModel = nextCustomModel;
  cachedSnapshot = {
    active: nextKey !== null,
    maskedKey: nextKey ? maskApiKey(nextKey) : null,
    modelMode: nextMode,
    customModel: nextCustomModel,
  };
}

function notify(): void {
  refreshCache();
  listeners.forEach((fn) => fn());
}

function bindStorageListener(): void {
  if (storageBound || typeof window === 'undefined') return;
  storageBound = true;
  window.addEventListener('storage', (e) => {
    if (
      e.key === null ||
      e.key === BYOK_KEY_STORAGE ||
      e.key === BYOK_MODE_STORAGE ||
      e.key === BYOK_MODEL_STORAGE
    ) {
      notify();
    }
  });
}

/** Reads the raw browser-local Gemini API key (never log or transmit to Motionpop servers). */
export function getByokKey(): string | null {
  if (typeof window === 'undefined') return null;
  refreshCache();
  return cachedKey ?? null;
}

export function isByokActive(): boolean {
  return getByokKey() !== null;
}

export function getByokModelMode(): ByokModelMode {
  if (typeof window === 'undefined') return 'balanced';
  refreshCache();
  return cachedMode ?? 'balanced';
}

export function getByokModel(): string | null {
  if (typeof window === 'undefined') return null;
  refreshCache();
  return cachedCustomModel ?? null;
}

/** Validates and saves the user's Google AI Studio Gemini API key locally in this browser. */
export function setByokKey(rawKey: string): { ok: true } | { ok: false; message: string } {
  const parsed = GeminiApiKeySchema.safeParse(rawKey);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? 'Enter a valid Gemini API key',
    };
  }
  writeStorage(BYOK_KEY_STORAGE, parsed.data);
  notify();
  return { ok: true };
}

/** Removes the browser-local Gemini API key and reverts to Firebase AI Logic / on-device. */
export function clearByokKey(): void {
  writeStorage(BYOK_KEY_STORAGE, null);
  writeStorage(BYOK_MODEL_STORAGE, null);
  notify();
}

/** Switches between Balanced (`gemini-2.5-pro` + `flash`) and Fast (`gemini-2.5-flash`). */
export function setByokModelMode(mode: ByokModelMode): void {
  const parsed = ByokModelModeSchema.parse(mode);
  writeStorage(BYOK_MODE_STORAGE, parsed);
  notify();
}

/** Sets an explicit Gemini model ID to use with BYOK, or `null` to use the Auto preset. */
export function setByokModel(model: string | null): void {
  const trimmed = model?.trim() ?? '';
  writeStorage(BYOK_MODEL_STORAGE, trimmed || null);
  notify();
}

/** Subscribes to BYOK key/mode changes (also used by `router-client` to reset the cached router). */
export function subscribeByok(fn: () => void): () => void {
  bindStorageListener();
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function getSnapshot(): ByokSnapshot {
  if (typeof window === 'undefined') return SERVER_SNAPSHOT;
  refreshCache();
  return cachedSnapshot;
}

/** Reactive BYOK status for UI components (safe with SSR & React 19 `useSyncExternalStore`). */
export function useByok(): ByokSnapshot {
  return useSyncExternalStore(subscribeByok, getSnapshot, () => SERVER_SNAPSHOT);
}
