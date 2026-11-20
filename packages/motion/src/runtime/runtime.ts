/**
 * Motionpop browser runtime, bundled to an IIFE and inlined into every composition.
 * Wires the engine to the page: the project payload, the font set and HyperFrames'
 * `hf-seek` event (detail.time in seconds). Pure function of time: no clocks, timers or rAF.
 */
import { components } from '../components';
import { scenes } from '../scenes';
import type { RuntimeProject } from '../compiler/types';
import { CUSTOM_ALLOW_FLAG } from '../components/custom/build';
import { createEngine, projectSeams, type SlotError, type SlotWarning } from './engine';
import { mountBackdrop } from './backdrop';
import { mountLens } from './lens';
import { mountWorld } from './world';
import { planVideo } from '../engine/video-plan';
import { mountCaptions } from './captions';
import { fontStack } from '../fonts/font-faces';
import { inspectBeat, type CriticSummary } from '../film/critic';

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
      /** Sound effects custom graphics asked for, by slot id. */
      sounds: () => Record<string, { kind: string; atMs: number }[]>;
      /** The film critic's report on one slot; null when the slot isn't mounted. */
      inspect: (
        slotId: string,
        opts?: {
          wantsPicture?: boolean;
          headMs?: number;
          lead?: string;
          allowNumbers?: readonly string[];
          transparent?: boolean;
        },
      ) => CriticSummary | null;
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
  const backdropHost = document.getElementById('mp-backdrop');
  // A film's beats carry the picture from start to end: no drifting backdrop behind them.
  // A staged video (spec 07c) is one world the camera travels through; otherwise the backdrop.
  const staged = project.staging !== false && project.slots.length > 0;
  const plan = staged && !project.film ? planVideo(project.slots) : null;
  const backdrop =
    backdropHost && !project.film && !project.hasVideo
      ? plan
        ? mountWorld(backdropHost, project, plan, projectSeams(project, plan))
        : mountBackdrop(backdropHost, project)
      : null;
  const lensHost = document.getElementById('mp-lens');
  const lens = lensHost ? mountLens(lensHost, project) : null;
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
          ...(project.captions.stageWindows ? { stageWindows: project.captions.stageWindows } : {}),
        },
        { width: project.width, height: project.height, format: project.format },
      );
      captions.seek(lastMs);
    }
    isReady = true;
  });
  const seek = (tMs: number) => {
    lastMs = tMs;
    backdrop?.seek(tMs);
    engine.seek(tMs);
    lens?.seek(tMs);
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
  /**
   * The film critic's view of one slot (spec 07b): seeks it through its own moments and reports
   * what a reviewer would. Synchronous; it shows the slot's clip for the visit (HyperFrames hides
   * clips outside its own clock) and puts everything back.
   */
  const inspect = (
    slotId: string,
    opts: {
      wantsPicture?: boolean;
      headMs?: number;
      lead?: string;
      allowNumbers?: readonly string[];
      transparent?: boolean;
    } = {},
  ): CriticSummary | null => {
    const slot = project.slots.find((s) => s.id === slotId);
    const host = document.getElementById(slotId);
    if (!slot || !host) return null;
    const before = host.getAttribute('style');
    const resumeMs = lastMs;
    // HyperFrames hides an inactive clip (and everything in it) through a marker attribute and
    // `visibility: hidden !important`; both are lifted for the visit.
    const hidden = host.getAttribute('data-hf-clip-hidden');
    host.removeAttribute('data-hf-clip-hidden');
    host.style.setProperty('display', 'block', 'important');
    host.style.setProperty('visibility', 'visible', 'important');
    host.style.setProperty('opacity', '1', 'important');
    const durationMs = slot.endMs - slot.startMs;
    const params = slot.params as { keyMomentMs?: unknown };
    const key =
      slot.keyMomentMs ?? (typeof params.keyMomentMs === 'number' ? params.keyMomentMs : 600);
    try {
      return inspectBeat(host, (t) => seek(slot.startMs + Math.round(t)), {
        durationMs,
        keyMomentMs: key,
        ...(slot.tailMs ? { tailMs: slot.tailMs } : {}),
        ...(slot.over ? { over: slot.over } : {}),
        ...opts,
        width: project.width,
        height: project.height,
        bg: project.style.colors.bg,
        errors: engine.errors
          .filter((e) => e.slotId === slotId)
          .map((e) => `${e.phase}: ${e.message}`),
      });
    } finally {
      if (before === null) host.removeAttribute('style');
      else host.setAttribute('style', before);
      if (hidden !== null) host.setAttribute('data-hf-clip-hidden', hidden);
      seek(resumeMs);
    }
  };
  window.__motionpop = { ...engine, seek, ready, inspect };
}
