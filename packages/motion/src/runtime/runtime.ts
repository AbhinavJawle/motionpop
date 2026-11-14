/**
 * Motionpop browser runtime, bundled to an IIFE and inlined into every composition.
 * Builds each slot's component once, then renders every frame from HyperFrames' `hf-seek`
 * event. Pure function of time: no clocks, timers or rAF.
 */
import { components } from '../components';
import type { Composition } from '../contract';
import type { RuntimeProject } from '../compiler/types';

declare global {
  interface Window {
    __MP_PROJECT__?: RuntimeProject;
    __motionpop?: { seek: (tMs: number) => void; ready: true };
  }
}

interface Mounted {
  startMs: number;
  durationMs: number;
  composition: Composition;
}

function mount(project: RuntimeProject): Mounted[] {
  const mounted: Mounted[] = [];
  for (const slot of project.slots) {
    const host = document.getElementById(slot.id);
    const component = components[slot.componentId as keyof typeof components];
    if (!host || !component) {
      console.error(`[motionpop] cannot mount slot ${slot.id} (${slot.componentId})`);
      continue;
    }
    const params = component.params.parse(slot.params);
    const durationMs = slot.endMs - slot.startMs;
    const root = document.createElement('div');
    host.append(root);
    const composition = component.build(
      {
        root,
        width: project.width,
        height: project.height,
        format: project.format,
        style: project.style,
        durationMs,
        keyMomentMs: slot.keyMomentMs ?? component.keyMomentMs(params, durationMs),
        fps: 30,
        seed: 1,
      },
      params,
    );
    mounted.push({ startMs: slot.startMs, durationMs, composition });
  }
  return mounted;
}

const project = window.__MP_PROJECT__;
if (project) {
  const slots = mount(project);
  const seek = (tMs: number) => {
    for (const s of slots) {
      const local = Math.min(Math.max(tMs - s.startMs, 0), s.durationMs);
      s.composition.seek(local);
    }
  };
  window.addEventListener('hf-seek', (e) => {
    const detail = (e as CustomEvent<{ time: number }>).detail;
    seek(Math.round(detail.time * 1000));
  });
  window.__motionpop = { seek, ready: true };
  seek(0);
}
