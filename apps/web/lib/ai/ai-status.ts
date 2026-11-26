'use client';

import { create } from 'zustand';
import { useEffect } from 'react';
import { firebaseEnabled } from '../firebase/client';
import { fakeAiFlag } from '../credits/pick-client';

/**
 * On-device AI status for Settings (spec 13 R6.3), the seam spec 09's `useAIStatus` builds on.
 * Detection reads Chrome's Prompt API global (the AI Logic SDK does not expose availability);
 * set-up runs `initializeDeviceModel`, which must follow a user gesture (hybrid-ai.md).
 */
export type Availability =
  'checking' | 'available' | 'downloadable' | 'downloading' | 'unavailable';

interface AIStatusState {
  availability: Availability;
  /** True only while a user-initiated download from Settings is actively running. */
  setupActive: boolean;
  /** 0..1 while the model downloads, else null. */
  setupProgress: number | null;
  detected: boolean;
  /** `navigator.onLine`, kept current by `watchConnection` (spec 09 R9.4). */
  online: boolean;
  /** Why the last set-up failed, shown under the status row; null otherwise. */
  setupError: string | null;
}

export const useAIStatusStore = create<AIStatusState>(() => ({
  availability: 'checking',
  setupActive: false,
  setupProgress: null,
  detected: false,
  online: true,
  setupError: null,
}));

/**
 * Follows the browser's online and offline events into the store. Returns the cleanup. Safe to
 * call from several components: each call adds its own listeners and sets the current value.
 */
export function watchConnection(
  target: Pick<Window, 'addEventListener' | 'removeEventListener'> & {
    navigator: { onLine: boolean };
  } = window,
): () => void {
  const sync = () => useAIStatusStore.setState({ online: target.navigator.onLine });
  sync();
  target.addEventListener('online', sync);
  target.addEventListener('offline', sync);
  return () => {
    target.removeEventListener('online', sync);
    target.removeEventListener('offline', sync);
  };
}

interface PromptApi {
  availability: (opts: { expectedInputs: { type: string }[] }) => Promise<string>;
}

/** Maps the Prompt API's answer to our states. Anything unknown is `unavailable`. */
export function mapAvailability(raw: unknown): Availability {
  if (raw === 'available' || raw === 'downloadable' || raw === 'downloading') return raw;
  return 'unavailable';
}

export async function detectAvailability(): Promise<void> {
  if (useAIStatusStore.getState().detected) return;
  useAIStatusStore.setState({ detected: true });
  if (
    fakeAiFlag({
      NODE_ENV: process.env.NODE_ENV,
      NEXT_PUBLIC_FAKE_AI: process.env.NEXT_PUBLIC_FAKE_AI,
    })
  ) {
    // `?device=off` plays a browser without Nano (spec 09 design, "Fake AI").
    const off = new URLSearchParams(globalThis.location?.search ?? '').get('device') === 'off';
    useAIStatusStore.setState({ availability: off ? 'unavailable' : 'available' });
    return;
  }
  // Without Firebase there is no AI Logic, so no on-device route either.
  const api = (globalThis as { LanguageModel?: PromptApi }).LanguageModel;
  if (!firebaseEnabled() || !api) {
    useAIStatusStore.setState({ availability: 'unavailable' });
    return;
  }
  try {
    const raw = await api.availability({ expectedInputs: [{ type: 'text' }, { type: 'image' }] });
    useAIStatusStore.setState({ availability: mapAvailability(raw) });
  } catch {
    useAIStatusStore.setState({ availability: 'unavailable' });
  }
}

interface PromptApiCreate {
  create: (opts: {
    expectedInputs: { type: string }[];
    monitor?: (m: EventTarget) => void;
    signal?: AbortSignal;
  }) => Promise<{ destroy?: () => void }>;
}

let setupAbort: AbortController | null = null;

/**
 * Cancels a running set-up (founder, 2026-11-16). Aborts our `LanguageModel.create()` and returns
 * to "Set up"; Chrome manages the model itself and may still finish a download it already began.
 */
export function cancelSetUp(): void {
  const s = useAIStatusStore.getState();
  if (!s.setupActive && s.availability !== 'downloading') return;
  setupAbort?.abort();
  setupAbort = null;
  useAIStatusStore.setState({
    availability: 'downloadable',
    setupActive: false,
    setupProgress: null,
    setupError: 'Download cancelled.',
  });
}

/**
 * Downloads the on-device model. Call it from a click handler only (Settings). Never throws.
 *
 * `LanguageModel.create()` is called before any `await`, so it runs inside the click's user
 * activation (a download needs one). We call the Prompt API directly instead of the SDK's
 * `initializeDeviceModel`, whose internal download promise is left unhandled when Chrome
 * rejects (for example an `AbortError` when the disk has less than the free space Chrome
 * requires), which left the bar at 0 % with a runtime error.
 */
export async function setUpOnDevice(): Promise<void> {
  const s = useAIStatusStore.getState();
  // Allow starting from both 'downloadable' and a passive Chrome 'downloading' state when no
  // user-initiated setup is already running, so the user can complete setup in one go in Settings.
  if (s.setupActive || (s.availability !== 'downloadable' && s.availability !== 'downloading')) {
    return;
  }
  const api = (globalThis as { LanguageModel?: PromptApiCreate }).LanguageModel;
  if (!api) {
    useAIStatusStore.setState({
      availability: 'unavailable',
      setupActive: false,
      setupProgress: null,
    });
    return;
  }
  useAIStatusStore.setState({
    availability: 'downloading',
    setupActive: true,
    setupProgress: 0,
    setupError: null,
  });
  const abort = new AbortController();
  setupAbort = abort;
  try {
    const session = await api.create({
      signal: abort.signal,
      expectedInputs: [{ type: 'text' }, { type: 'image' }],
      monitor: (m) =>
        m.addEventListener('downloadprogress', (e) =>
          useAIStatusStore.setState({ setupProgress: (e as unknown as { loaded: number }).loaded }),
        ),
    });
    session.destroy?.();
    if (abort.signal.aborted) return;
    setupAbort = null;
    useAIStatusStore.setState({
      availability: 'available',
      setupActive: false,
      setupProgress: null,
    });
  } catch (err) {
    // A cancel already reset the state and its message.
    if (abort.signal.aborted) return;
    setupAbort = null;
    console.warn('On-device set-up failed', err);
    useAIStatusStore.setState({
      availability: 'downloadable',
      setupActive: false,
      setupProgress: null,
      setupError:
        'Chrome stopped the download. It needs about 22 GB of free disk space and a supported GPU or 16 GB of RAM.',
    });
  }
}

export function useAIStatus(): Pick<
  AIStatusState,
  'availability' | 'setupActive' | 'setupProgress' | 'online' | 'setupError'
> {
  const availability = useAIStatusStore((s) => s.availability);
  const setupActive = useAIStatusStore((s) => s.setupActive);
  const setupProgress = useAIStatusStore((s) => s.setupProgress);
  const online = useAIStatusStore((s) => s.online);
  const setupError = useAIStatusStore((s) => s.setupError);
  useEffect(() => {
    void detectAvailability();
    return watchConnection();
  }, []);
  return { availability, setupActive, setupProgress, online, setupError };
}
