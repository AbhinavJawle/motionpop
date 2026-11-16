'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { appAudioStore } from './app-audio-store';

export type UploadState = 'idle' | 'uploading' | 'failing';

const EMPTY: readonly string[] = [];
const serverState = (): UploadState => 'idle';

/** Whether these audio refs still wait to upload (the editor's save indicator, design §10). */
export function useUploadState(refs: readonly string[] = EMPTY): UploadState {
  const store = appAudioStore();
  const key = refs.join('\n');
  const subscribe = useCallback((fn: () => void) => store.subscribe(fn), [store]);
  return useSyncExternalStore(
    subscribe,
    () => {
      const { pending, failing } = store.uploadStatus();
      const mine = key ? key.split('\n') : [];
      if (mine.some((r) => failing.has(r))) return 'failing';
      return mine.some((r) => pending.has(r)) ? 'uploading' : 'idle';
    },
    serverState,
  );
}
