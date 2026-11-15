'use client';

import { componentFillTask, paramsSchemaSummary, skillEntry, type Router } from '@motionpop/ai';
import { components } from '@motionpop/motion';
import type { AppConfig, Version } from '@motionpop/schemas';
import { useEffect } from 'react';
import type { z } from 'zod';
import { getRouter } from '@/lib/ai/router-client';
import { applyAutoFill, sameSlot } from '@/lib/commands/auto-fill';
import { spokenText } from '@/lib/editor/slot-display';
import { loadAppConfig } from '@/lib/firebase/remote-config';
import { editorStore, useEditor, type EditorStore } from '@/lib/stores/editor';
import { autoFillQueue } from './auto-fill-plan';
import { validateParams } from './validate-params';

const schemaFor = (id: string): z.ZodType | undefined =>
  (components as Record<string, { params: z.ZodType } | undefined>)[id]?.params;
const FILL = componentFillTask(schemaFor);

export interface AutoFillDeps {
  store: EditorStore;
  getRouter: () => Promise<Router | null>;
  loadConfig: () => Promise<{ config: Pick<AppConfig, 'flagAutoFill'> }>;
  now: () => number;
}

/**
 * Auto-fill (spec 06 R5): after a project loads, fill its suggested slots one at a time, in
 * timeline order, with `component.fill` on the device. Free by construction (ONLY_ON_DEVICE);
 * without Nano, a failure or the flag off, slots simply stay suggested. A slot the user touched
 * since load is never filled, and `cancelled()` (editor closed, another load) stops the loop.
 */
export async function runAutoFill(deps: AutoFillDeps, cancelled: () => boolean): Promise<number> {
  const start = deps.store.getState().project;
  if (!start) return 0;
  const loaded = new Map(start.slots.map((s) => [s.id, s]));
  const tried = new Set<string>();
  const router = await deps.getRouter().catch(() => null);
  if (!router || cancelled()) return 0;
  const { config } = await deps.loadConfig();
  if (!config.flagAutoFill || cancelled()) return 0;

  let filled = 0;
  for (;;) {
    const p = deps.store.getState().project;
    if (cancelled() || !p || p.id !== start.id) break;
    const slot = autoFillQueue(p, loaded, tried, (id) => schemaFor(id) !== undefined)[0];
    if (!slot) break;
    tried.add(slot.id);
    const schema = schemaFor(slot.componentId);
    if (!schema) continue;
    deps.store.getState().setAutoFilling(slot.id);
    try {
      const res = await router.run(FILL, {
        purpose: 'autofill',
        componentId: slot.componentId,
        paramsSchemaSummary: paramsSchemaSummary(schema),
        words: spokenText(slot, p.transcript.words),
        prompt: slot.prompt || slot.reason,
        currentParams: slot.params,
        styleId: p.styleId,
        skill: { shotSequence: '', emphasis: skillEntry(slot.skillId)?.useWhen ?? '' },
      });
      if (cancelled()) break;
      const v = validateParams(slot.componentId, res.output.params);
      const needsInput = [...new Set([...(res.output.needsInput ?? []), ...v.needsInput])];
      const version: Version = {
        id: `v-${slot.id}-af-${deps.now()}`,
        slotId: slot.id,
        componentId: slot.componentId,
        params: v.params,
        source: res.ranOn === 'device' ? 'ai-device' : 'ai-cloud',
        model: res.model,
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
    } catch {
      // RouterError (no Nano, invalid twice, …): the slot stays suggested (spec 06 R5.2).
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
