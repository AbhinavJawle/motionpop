// Reel engine (spec 25): the composition's runtime (bundled to dist/reel-runtime.js). Mounts the
// reel on #reel-stage and draws every frame from HyperFrames' `hf-seek` (time in seconds).
import type { ReelData } from './mount';
import { mountReel } from './mount';

declare global {
  interface Window {
    __REEL__?: ReelData;
    __reel?: { seek(ms: number): void; ready: Promise<void> };
  }
}

const data = window.__REEL__;
const stage = document.getElementById('reel-stage');
if (data && stage) {
  const vwrap = stage.querySelector('[data-reel-vwrap]');
  const videos: HTMLVideoElement[] = vwrap
    ? Array.from(vwrap.querySelectorAll<HTMLVideoElement>('video'))
    : Array.from(stage.querySelectorAll<HTMLVideoElement>('video:not([data-reel-clip-scene])'));
  const reel = mountReel(stage, data, videos);
  const hasCustom = data.plan.scenes.some((s) => s.content.template === 'custom');
  let ready = false;
  const failOnCustomErrors = () => {
    const errors = reel.customErrors();
    if (errors.length > 0) throw new Error(`AI-written scene failed: ${errors.join('; ')}`);
  };
  void reel.ready.then(() => {
    ready = true;
  });
  window.addEventListener('hf-seek', (e) => {
    const detail = (e as CustomEvent<{ time: number; waitUntil?: (p: Promise<unknown>) => void }>)
      .detail;
    reel.seek(Math.round(detail.time * 1000));
    // Until fonts are in and scenes are built, the capture waits (HyperFrames 0.9.46). An
    // AI-written scene that never built fails the render (refunded) instead of exporting a blank
    // or frozen scene: a rejected waitUntil fails the capture.
    if (!ready) detail.waitUntil?.(reel.ready.then(failOnCustomErrors).then(() => reel.drawn()));
    // AI-written scenes draw in their own frames (spec 30): the capture waits for this frame.
    else if (hasCustom)
      detail.waitUntil?.(
        Promise.resolve()
          .then(failOnCustomErrors)
          .then(() => reel.drawn()),
      );
  });
  window.__reel = { seek: (ms) => reel.seek(ms), ready: reel.ready };
  reel.seek(0);
}
