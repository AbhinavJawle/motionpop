'use client';

import { useEffect, useState } from 'react';
import { mulberry32 } from './rng';

const BLINK_MS = 140;

/** True for ~140 ms every 3–6 s (seeded per mount). Disabled → always false. */
export function useBlink(enabled: boolean, seed: number): boolean {
  const [closed, setClosed] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    const rnd = mulberry32(seed);
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(
        () => {
          setClosed(true);
          timer = setTimeout(() => {
            setClosed(false);
            schedule();
          }, BLINK_MS);
        },
        3000 + rnd() * 3000,
      );
    };
    schedule();
    return () => {
      clearTimeout(timer);
      setClosed(false);
    };
  }, [enabled, seed]);
  return enabled && closed;
}
