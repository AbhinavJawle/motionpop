/**
 * Motionpop browser runtime, bundled to an IIFE and inlined into every composition.
 * Wires the engine to the page: the project payload, the font set and HyperFrames'
 * `hf-seek` event (detail.time in seconds). Pure function of time: no clocks, timers or rAF.
 */
import { components } from '../components';
import { scenes } from '../scenes';
import type { RuntimeProject } from '../compiler/types';
import { CUSTOM_ALLOW_FLAG } from '../components/custom/build';
import { createEngine, type SlotError, type SlotWarning } from './engine';
import { mountCaptions } from './captions';
import { fontStack } from '../fonts/font-faces';

declare global {
  interface Window {
    __MP_PROJECT__?: RuntimeProject;
    __motionpop?: {
      seek: (tMs: number) => void;
      ready: Promise<void>;
      errors: SlotError[];
      warnings: SlotWarning[];
      /** Stage reports of mounted scenes, by slot id. */
      reports: () => Record<string, unknown>;
    };
  }
}

const project = window.__MP_PROJECT__;
if (project) {
  // Inside the composition (sandboxed preview iframe or the render page) generated graphics may
  // run; the app never sets this, so they can't run in its own origin (spec 15).
  (window as unknown as Record<string, unknown>)[CUSTOM_ALLOW_FLAG] = true;
  const engine = createEngine(project, {
    doc: document,
    components: { ...components, ...scenes },
    fonts: document.fonts,
  });
  let isReady = false;
  let lastMs = 0;
  let captions: { seek(tMs: number): void } | null = null;
  // Captions measure text, so they mount once the engine has loaded the fonts (spec 12 R5).
  const ready = engine.ready.then(() => {
    const host = document.getElementById('mp-captions');
    if (project.captions && host) {
      captions = mountCaptions(
        host,
        {
          presetId: project.captions.presetId,
          groups: project.captions.groups,
          accent: project.style.colors.accent,
          font: fontStack(project.style.fonts.body),
        },
        { width: project.width, height: project.height, format: project.format },
      );
      captions.seek(lastMs);
    }
    isReady = true;
  });
  const seek = (tMs: number) => {
    lastMs = tMs;
    engine.seek(tMs);
    captions?.seek(tMs);
  };
  // Registered synchronously so seeks that arrive before fonts are ready are not lost.
  // HyperFrames 0.9.46 passes `waitUntil` (must be called synchronously): until our engine is
  // ready, the frame capture waits on it, so the producer never captures a pre-font frame.
  window.addEventListener('hf-seek', (e) => {
    const detail = (e as CustomEvent<{ time: number; waitUntil?: (p: Promise<unknown>) => void }>)
      .detail;
    seek(Math.round(detail.time * 1000));
    if (!isReady) detail.waitUntil?.(ready);
  });
  window.__motionpop = { ...engine, seek, ready };
}
