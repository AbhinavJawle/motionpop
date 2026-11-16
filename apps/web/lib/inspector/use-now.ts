'use client';

import { useEffect, useState } from 'react';

/** The current time in ms, refreshed every `everyMs` (for "2 min ago" labels). Pure to render. */
export function useNow(everyMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return now;
}
