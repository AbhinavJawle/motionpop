'use client';

import { useEffect, useState, type RefObject } from 'react';

export interface Look {
  x: number;
  y: number;
}

const clamp = (v: number) => Math.max(-1, Math.min(1, v));

/**
 * Pointer position relative to an element's centre, normalised to −1..1
 * (half the viewport in each direction = full deflection). Disabled → {0, 0}.
 */
export function useLook(ref: RefObject<Element | null>, enabled: boolean): Look {
  const [look, setLook] = useState<Look>({ x: 0, y: 0 });
  useEffect(() => {
    if (!enabled) return;
    let frame = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const el = ref.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        setLook({
          x: clamp((e.clientX - (r.left + r.width / 2)) / (window.innerWidth / 2)),
          y: clamp((e.clientY - (r.top + r.height / 2)) / (window.innerHeight / 2)),
        });
      });
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', onMove);
      setLook({ x: 0, y: 0 });
    };
  }, [ref, enabled]);
  return look;
}
