'use client';

import { useEffect } from 'react';
import { keptSegments, renderCleaned } from '@/lib/audio/render-cleaned';

/**
 * Test-only hook for the Playwright audio specs (spec 05 task 9): exposes the browser-only
 * renderCleaned on `window`. Lives under app/dev, which the layout hides in production.
 */
export default function AudioTestPage() {
  useEffect(() => {
    (window as unknown as { __audioTest?: unknown }).__audioTest = { renderCleaned, keptSegments };
  }, []);
  return <p className="text-[13px] text-text-2">Audio test hook</p>;
}
