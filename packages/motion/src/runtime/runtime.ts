/**
 * Motionpop browser runtime, bundled to an IIFE and inlined into every composition.
 * Wires the engine to the page: the project payload, the font set and HyperFrames'
 * `hf-seek` event (detail.time in seconds). Pure function of time: no clocks, timers or rAF.
 */
import { components } from '../components';
import type { RuntimeProject } from '../compiler/types';
import { createEngine, type SlotError, type SlotWarning } from './engine';

declare global {
  interface Window {
    __MP_PROJECT__?: RuntimeProject;
    __motionpop?: {
      seek: (tMs: number) => void;
      ready: Promise<void>;
      errors: SlotError[];
      warnings: SlotWarning[];
    };
  }
}

const project = window.__MP_PROJECT__;
if (project) {
  const engine = createEngine(project, { doc: document, components, fonts: document.fonts });
  let isReady = false;
  void engine.ready.then(() => {
    isReady = true;
  });
  // Registered synchronously so seeks that arrive before fonts are ready are not lost.
  // HyperFrames 0.9.46 passes `waitUntil` (must be called synchronously): until our engine is
  // ready, the frame capture waits on it, so the producer never captures a pre-font frame.
  window.addEventListener('hf-seek', (e) => {
    const detail = (e as CustomEvent<{ time: number; waitUntil?: (p: Promise<unknown>) => void }>)
      .detail;
    engine.seek(Math.round(detail.time * 1000));
    if (!isReady) detail.waitUntil?.(engine.ready);
  });
  window.__motionpop = engine;
}
