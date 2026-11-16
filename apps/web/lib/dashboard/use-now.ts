'use client';

import { useSyncExternalStore } from 'react';

const MINUTE = 60_000;

function subscribe(fn: () => void): () => void {
  const t = setInterval(fn, 30_000);
  return () => clearInterval(t);
}

const snapshot = () => Math.floor(Date.now() / MINUTE) * MINUTE;

/**
 * The current time to the minute, or null during server rendering, so time-dependent copy
 * (the greeting, "Edited 12 minutes ago") never mismatches on hydration.
 */
export function useNow(): number | null {
  return useSyncExternalStore(subscribe, snapshot, () => null);
}
