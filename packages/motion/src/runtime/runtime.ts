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
  // Registered synchronously so seeks that arrive before fonts are ready are not lost.
  window.addEventListener('hf-seek', (e) => {
    const detail = (e as CustomEvent<{ time: number }>).detail;
    engine.seek(Math.round(detail.time * 1000));
  });
  window.__motionpop = engine;
}
