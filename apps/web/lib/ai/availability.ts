import type { Availability } from './ai-status';

/**
 * What the editor tells the creator about on-device AI (spec 09 R9.1, R9.2, R9.4). Pure: the
 * component `AIStatusToasts` turns these answers into toasts, so the rules are testable without
 * a browser. Exact strings come from `screens.md` ("Toasts" and "Offline").
 */
export const READY_TITLE = 'On-device AI ready';
export const READY_BODY = 'Small edits run instantly on your device, free and private.';
export const CLOUD_TITLE = 'Using cloud AI';
export const CLOUD_BODY = "Your browser doesn't support on-device AI yet. Everything still works.";
export const SETUP_BODY = 'Set up on-device AI for free, private edits. It downloads once.';
export const SETUP_ACTION = 'Set up on-device AI';
export const SETUP_FAILED = "Couldn't set up on-device AI. Try again from the toast or Settings.";
export const OFFLINE_BANNER =
  "You're offline. On-device edits still work. New graphics will generate when you're back.";
export const SETUP_TOAST_ID = 'ai-setup';
/** One availability toast per browser session (sessionStorage). */
export const SESSION_KEY = 'mp.ai-status-toast';

export type AIToast =
  /** Mint: the model is ready; `afterSetup` when the creator just downloaded it. */
  | { kind: 'ready'; afterSetup: boolean }
  /** Violet: the cloud is used; `setup` adds the "Set up on-device AI" action. */
  | { kind: 'cloud'; setup: boolean }
  /** Persistent progress toast while the model downloads. */
  | { kind: 'progress' }
  | { kind: 'setup-failed' };

/**
 * The toast an availability change calls for, or null. `prev` is the last seen availability
 * (null before the first answer); `alreadyShown` is the once-per-session flag. Progress, the
 * result of a setup and a failed setup always show: they answer something the creator did.
 * `checking` never shows anything, so a slow detection can't flash a wrong toast.
 */
export function toastFor(
  prev: Availability | null,
  next: Availability,
  alreadyShown: boolean,
): AIToast | null {
  if (next === 'checking' || prev === next) return null;
  if (prev === 'downloading' && next === 'available') return { kind: 'ready', afterSetup: true };
  if (prev === 'downloading' && next === 'downloadable') return { kind: 'setup-failed' };
  if (next === 'downloading') return { kind: 'progress' };
  if (alreadyShown) return null;
  if (next === 'available') return { kind: 'ready', afterSetup: false };
  if (next === 'downloadable') return { kind: 'cloud', setup: true };
  return { kind: 'cloud', setup: false };
}

/** "Setting up on-device AI · 34 %" from a 0..1 progress (the SDK reports a fraction). */
export function progressLabel(progress: number | null): string {
  const p =
    progress === null || !Number.isFinite(progress) ? 0 : Math.min(1, Math.max(0, progress));
  return `Setting up on-device AI · ${Math.round(p * 100)} %`;
}

export interface SessionStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** True the first time per session. Storage that throws (private mode) counts as "not shown yet". */
export function claimSessionToast(store: SessionStore | undefined): boolean {
  if (!store) return true;
  try {
    if (store.getItem(SESSION_KEY) !== null) return false;
    store.setItem(SESSION_KEY, '1');
  } catch {
    // Storage unavailable: show it, it is only a hint.
  }
  return true;
}

/**
 * Whether the availability toasts stay quiet. Local mode (no Firebase, no fake AI) has no cloud
 * to fall back to, so "Using cloud AI" would be untrue. The fake-AI flag used by the e2e specs
 * is quiet unless the URL asks for the toasts (`?aiToasts=1`), so the design screenshots stay
 * clean.
 */
export function toastsQuiet(i: { firebase: boolean; fakeAi: boolean; search: string }): boolean {
  if (i.fakeAi) return !new URLSearchParams(i.search).has('aiToasts');
  return !i.firebase;
}
