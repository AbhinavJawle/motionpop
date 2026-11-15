'use client';
import { componentFillTask, skillEntry, type ComponentFillInput, type Router } from '@motionpop/ai';
import { type Scene } from '@motionpop/motion';
import type { AppConfig, EditorProject, Slot, Version } from '@motionpop/schemas';
import { useEffect } from 'react';
import { getRouter } from '@/lib/ai/router-client';
import { applyAutoFill, sameSlot } from '@/lib/commands/auto-fill';
import { spokenText } from '@/lib/editor/slot-display';
import { loadAppConfig } from '@/lib/firebase/remote-config';
import { sceneFor, schemaFor } from '@/lib/motion/registry';
import { editorStore, useEditor, type EditorStore } from '@/lib/stores/editor';
import { autoFillQueue } from './auto-fill-plan';
import { sceneFallback, sceneFillInput, sceneGate } from './scene-fill';
import { validateParams } from './validate-params';

const FILL = componentFillTask(schemaFor);

export interface AutoFillDeps {
  store: EditorStore;
  getRouter: () => Promise<Router | null>;
  loadConfig: () => Promise<{ config: Pick<AppConfig, 'flagAutoFill'> }>;
  now: () => number;
  /** Where scene gates build slots off-screen. Defaults to the page's `document`. */
  doc?: Document;
}

interface Filled {
  params: Record<string, unknown>;
  needsInput: string[];
  source: Version['source'];
  model?: string;
  costCredits: number;
}

/**
 * Scenes (spec 07 task 27): `component.fill` on the device with the scene's catalogue entry,
 * the slot's indexed words, 2 examples and the gate as the router's check (2 repair rounds).
 * If the model is missing, fails, or says it lacks a value, the slot gets its safe default from
 * the spoken words (R1.4). Null only when the words give nothing that passes the gates.
 */
async function fillScene(
  router: Router | null,
  scene: Scene<unknown>,
  project: EditorProject,
  slot: Slot,
  doc: Document | undefined,
): Promise<Filled | null> {
  const gate = sceneGate(scene, project, slot, doc);
  if (router) {
    try {
      const task = componentFillTask(schemaFor, { gate: (_id, params) => gate.check(params) });
      const res = await router.run(task, sceneFillInput(scene, project, slot));
      if (!res.output.needsInput?.length) {
        return {
          params: res.output.params,
          needsInput: [],
          source: res.ranOn === 'device' ? 'ai-device' : 'ai-cloud',
          model: res.model,
          costCredits: res.costCredits,
        };
      }
    } catch {
      // RouterError (no Nano, invalid after 2 repairs, …): the safe default below.
    }
  }
  const safe = sceneFallback(scene, slot, gate);
  return safe ? { params: safe, needsInput: [], source: 'default', costCredits: 0 } : null;
}

/** Components (spec 06): device only; on failure the slot simply stays suggested (R5.2). */
async function fillComponent(
  router: Router,
  project: EditorProject,
  slot: Slot,
): Promise<Filled | null> {
  try {
    const input: ComponentFillInput = {
      purpose: 'autofill',
      componentId: slot.componentId,
      words: spokenText(slot, project.transcript.words),
      prompt: slot.prompt || slot.reason,
      currentParams: slot.params,
      styleId: project.styleId,
      skill: { shotSequence: '', emphasis: skillEntry(slot.skillId)?.useWhen ?? '' },
    };
    const res = await router.run(FILL, input);
    return {
      params: res.output.params,
      needsInput: res.output.needsInput ?? [],
      source: res.ranOn === 'device' ? 'ai-device' : 'ai-cloud',
      model: res.model,
      costCredits: res.costCredits,
    };
  } catch {
    return null;
  }
}

/**
 * Auto-fill (spec 06 R5, spec 07 task 27): after a project loads, fill its suggested slots one
 * at a time, in timeline order, on the device. Free by construction (ONLY_ON_DEVICE). Without
 * Nano or on a failure, a component slot stays suggested and a scene slot gets its safe default
 * from the spoken words (spec 07 R1.4). A slot the user touched since load is never filled, and
 * `cancelled()` (editor closed, another load) stops the loop. The flag off stops everything.
 */
export async function runAutoFill(deps: AutoFillDeps, cancelled: () => boolean): Promise<number> {
  const start = deps.store.getState().project;
  if (!start) return 0;
  const loaded = new Map(start.slots.map((s) => [s.id, s]));
  const tried = new Set<string>();
  const router = await deps.getRouter().catch(() => null);
  if (cancelled()) return 0;
  const { config } = await deps.loadConfig();
  if (!config.flagAutoFill || cancelled()) return 0;
  // Scenes always have a fallback; components need the device model.
  const canFill = (id: string) =>
    sceneFor(id) !== undefined || (router !== null && schemaFor(id) !== undefined);
  let filled = 0;
  for (;;) {
    const p = deps.store.getState().project;
    if (cancelled() || !p || p.id !== start.id) break;
    const slot = autoFillQueue(p, loaded, tried, canFill)[0];
    if (!slot) break;
    tried.add(slot.id);
    const scene = sceneFor(slot.componentId);
    deps.store.getState().setAutoFilling(slot.id);
    try {
      const res = scene
        ? await fillScene(router, scene, p, slot, deps.doc)
        : router
          ? await fillComponent(router, p, slot)
          : null;
      if (cancelled()) break;
      if (!res) continue;
      const v = validateParams(slot.componentId, res.params);
      const needsInput = [...new Set([...res.needsInput, ...v.needsInput])];
      const version: Version = {
        id: `v-${slot.id}-af-${deps.now()}`,
        slotId: slot.id,
        componentId: slot.componentId,
        params: v.params,
        source: res.source,
        ...(res.model ? { model: res.model } : {}),
        costCredits: res.costCredits,
        createdAt: deps.now(),
        label: 'Auto-fill',
      };
      // Checked here too so an edit made mid-fill is skipped quietly, not shown as a rejection.
      const current = deps.store.getState().project?.slots.find((s) => s.id === slot.id);
      if (current && sameSlot(current, slot)) {
        const ok = deps.store
          .getState()
          .exec(applyAutoFill(slot.id, slot, { params: v.params, needsInput, version }));
        if (ok) filled++;
      }
    } finally {
      deps.store.getState().setAutoFilling(null);
    }
  }
  return filled;
}

/** Mount once in the editor. Restarts on every project load. */
export function useAutoFill(): void {
  const loadCount = useEditor((s) => s.loadCount);
  useEffect(() => {
    if (loadCount === 0) return;
    let cancelled = false;
    void runAutoFill(
      { store: editorStore, getRouter, loadConfig: loadAppConfig, now: Date.now },
      () => cancelled,
    );
    return () => {
      cancelled = true;
      editorStore.getState().setAutoFilling(null);
    };
  }, [loadCount]);
}
