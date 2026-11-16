'use client';

import { FORMATS } from '@motionpop/schemas';
import { useEffect } from 'react';
import { captureRegion, playerSource, type CaptureRegion } from '@/lib/notes/capture';
import { editorStore } from '@/lib/stores/editor';

/**
 * Dev and test builds only: `window.__capture(region)` runs the real frame capture against the
 * mounted preview player, so the spike spec (spec 09 task 19) can measure time, tainting and
 * fidelity in a real browser. Renders nothing; absent in production.
 */
export function CaptureTestHook() {
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    const w = window as unknown as Record<string, unknown>;
    w['__capture'] = async (region: CaptureRegion) => {
      const player = document.querySelector<HTMLElement>('hyperframes-player');
      const format = editorStore.getState().project?.format ?? '16:9';
      const t0 = performance.now();
      const url = await captureRegion(playerSource(player, FORMATS[format]), region);
      return { url: url ?? null, ms: performance.now() - t0 };
    };
    return () => {
      delete w['__capture'];
    };
  }, []);
  return null;
}
