import type { EditorStore } from '@/lib/stores/editor';

/**
 * Turns a demo slot into a component that isn't built yet (`callout`), for the "planned graphic"
 * cases. The demo's slot-3 was the planned example until map-zoom shipped (spec 07).
 */
export function makePlanned(store: EditorStore, slotId = 'slot-3'): void {
  const p = store.getState().project;
  if (!p) throw new Error('makePlanned: no project loaded');
  store.getState().load({
    ...p,
    slots: p.slots.map((s) => (s.id === slotId ? { ...s, componentId: 'callout' } : s)),
  });
}
