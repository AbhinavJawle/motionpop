'use client';

import { create } from 'zustand';
import { useEffect } from 'react';
import { firebaseEnabled, getAILogic } from '../firebase/client';
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
  /** 0..1 while the model downloads, else null. */
  setupProgress: number | null;
  detected: boolean;
  /** `navigator.onLine`, kept current by `watchConnection` (spec 09 R9.4). */
  online: boolean;
}

export const useAIStatusStore = create<AIStatusState>(() => ({
  availability: 'checking',
  setupProgress: null,
  detected: false,
  online: true,
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

/** Downloads the on-device model. Call it from a click handler only. Never throws. */
export async function setUpOnDevice(): Promise<void> {
  const s = useAIStatusStore.getState();
  if (s.availability !== 'downloadable') return;
  useAIStatusStore.setState({ availability: 'downloading', setupProgress: 0 });
  try {
    const ai = await getAILogic();
    const { getGenerativeModel, InferenceMode } = await import('firebase/ai');
    const model = getGenerativeModel(ai, { mode: InferenceMode.ONLY_ON_DEVICE });
    await model.initializeDeviceModel((p) => useAIStatusStore.setState({ setupProgress: p }));
    useAIStatusStore.setState({ availability: 'available', setupProgress: null });
  } catch (err) {
    console.warn('On-device set-up failed', err);
    useAIStatusStore.setState({ availability: 'downloadable', setupProgress: null });
  }
}

export function useAIStatus(): Pick<AIStatusState, 'availability' | 'setupProgress' | 'online'> {
  const availability = useAIStatusStore((s) => s.availability);
  const setupProgress = useAIStatusStore((s) => s.setupProgress);
  const online = useAIStatusStore((s) => s.online);
  useEffect(() => {
    void detectAvailability();
    return watchConnection();
  }, []);
  return { availability, setupProgress, online };
}
