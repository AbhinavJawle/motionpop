'use client';

import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

/**
 * True when the user prefers reduced motion. Hydration-safe: the server and the hydration pass
 * both see `false`, then React re-renders with the real value (motion's `useReducedMotion` reads
 * matchMedia during the first client render and causes hydration mismatches).
 */
export function useStill(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
