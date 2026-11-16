import type { EditorProject, Slot } from '@motionpop/schemas';
import { componentFor, sceneFor } from '@/lib/motion/registry';
import { sceneFallback, sceneGate } from './scene-fill';
import { validateParams } from './validate-params';

/**
 * "Use a template" (spec 09 R6.9): the free, deterministic content for a slot. A scene gets its
 * safe default from the spoken words (the draft when it passes the gates, else
 * `safeScoreFromWords`); a library component gets its defaults. Null when the graphic has
 * nothing to fall back on (a planned component that is not built yet, or words that give no
 * content), so the caller can say so instead of changing nothing.
 */
export function templateParams(
  project: EditorProject,
  slot: Slot,
  doc?: Document,
): Record<string, unknown> | null {
  const scene = sceneFor(slot.componentId);
  if (scene) return sceneFallback(scene, slot, sceneGate(scene, project, slot, doc));
  const component = componentFor(slot.componentId);
  if (!component) return null;
  const v = validateParams(slot.componentId, component.defaults as Record<string, unknown>);
  return v.params;
}
