import fc from 'fast-check';
import { beforeEach, describe, expect, it } from 'vitest';
import { slotCardText } from '@/lib/editor/slot-display';
import { demoProject } from '@/lib/projects/fixture';
import { createEditorStore } from '@/lib/stores/editor';
import { applyTemplate } from './apply-template';
import { componentFillInput } from './component-fill-input';
import {
  DEFAULT_GENERATE_MS,
  generateMedianMs,
  recordGenerateMs,
  resetGenerateTiming,
} from './generate-timing';
import { sceneFillInput } from './scene-fill';
import { sceneFor } from '@/lib/motion/registry';

describe('generate timing (the progress line)', () => {
  beforeEach(resetGenerateTiming);
  it('is 6 s until something is measured, then the median of the last five', () => {
    expect(generateMedianMs()).toBe(DEFAULT_GENERATE_MS);
    for (const ms of [4000, 9000, 5000]) recordGenerateMs(ms);
    expect(generateMedianMs()).toBe(5000);
    for (const ms of [7000, 3000, 8000]) recordGenerateMs(ms); // 4000 and 9000 age out
    expect(generateMedianMs()).toBe(7000);
  });
  it('ignores nonsense', () => {
    recordGenerateMs(Number.NaN);
    recordGenerateMs(-5);
    expect(generateMedianMs()).toBe(DEFAULT_GENERATE_MS);
  });
  it('property: the median lies between the smallest and the largest sample kept', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 60_000 }), { minLength: 1, maxLength: 12 }),
        (xs) => {
          resetGenerateTiming();
          for (const x of xs) recordGenerateMs(x);
          const kept = xs.slice(-5);
          const m = generateMedianMs();
          expect(m).toBeGreaterThanOrEqual(Math.min(...kept));
          expect(m).toBeLessThanOrEqual(Math.max(...kept));
        },
      ),
    );
  });
});

describe('slot card text while generating', () => {
  const slot = demoProject(0).slots.find((s) => s.id === 'slot-3')!;
  it('shows the Generate phase as the subtitle', () => {
    expect(slotCardText(slot, 'preparing').subtitle).toBe('Preparing motion…');
    expect(slotCardText(slot, 'animating').subtitle).toBe('Animating…');
    expect(slotCardText(slot).subtitle).toBe('Generating map');
  });
});

describe('component fill input is one builder for auto-fill and Generate', () => {
  const project = demoProject(0);
  const slot = project.slots.find((s) => s.id === 'slot-2')!;
  it('differs only by purpose', () => {
    const a = componentFillInput(project, slot, 'autofill');
    const g = componentFillInput(project, slot, 'generate');
    expect(a.purpose).toBe('autofill');
    expect(g.purpose).toBe('generate');
    expect({ ...g, purpose: 'autofill' }).toEqual(a);
    expect(g.words).toBe('revenue grew forty percent since 2020');
  });
  it('scene input takes the purpose too, defaulting to autofill', () => {
    const scene = sceneFor('stat-punch');
    if (!scene) throw new Error('stat-punch is registered');
    const s = { ...slot, componentId: 'stat-punch' };
    expect(sceneFillInput(scene, project, s).purpose).toBe('autofill');
    expect(sceneFillInput(scene, project, s, 'generate').purpose).toBe('generate');
  });
});

describe('applyTemplate (Use a template)', () => {
  it('applies the component defaults as a free "default" version, undoable', () => {
    const store = createEditorStore(() => 1000);
    store.getState().load(demoProject(0));
    expect(applyTemplate(store, 'slot-4')).toBe(true);
    const slot = store.getState().project!.slots.find((s) => s.id === 'slot-4')!;
    const v = store.getState().project!.versions.find((x) => x.id === slot.currentVersionId)!;
    expect(v).toMatchObject({ source: 'default', costCredits: 0, label: 'Template' });
    store.getState().undo();
    expect(
      store.getState().project!.slots.find((s) => s.id === 'slot-4')!.currentVersionId,
    ).not.toBe(v.id);
  });
  it('says nothing was applied for a graphic that has no template', () => {
    const store = createEditorStore(() => 1000);
    store.getState().load(demoProject(0));
    expect(applyTemplate(store, 'slot-3')).toBe(false);
    expect(applyTemplate(store, 'nope')).toBe(false);
  });
});
