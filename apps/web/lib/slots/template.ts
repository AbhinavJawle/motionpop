import type { EditorProject, Slot } from '@motionpop/schemas';
import { componentFor, sceneFor } from '@/lib/motion/registry';
import { safeScoreFromWords } from '@motionpop/motion';
import { looseContent } from './loose';
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
  /** True when the creator picked this type: draft loosely rather than give up (loose.ts). */
  loose = false,
): Record<string, unknown> | null {
  const scene = sceneFor(slot.componentId);
  if (scene) {
    const gate = sceneGate(scene, project, slot, doc);
    const strict = sceneFallback(scene, slot, gate);
    if (strict || !loose) return strict;
    // A type the creator picked: a loose draft from any words, through the same gate and
    // shortening as the scene's own drafter.
    const content = looseContent(slot.componentId, gate.words);
    if (!content) return null;
    const lenient = { ...scene, safe: () => content } as typeof scene;
    const safe = safeScoreFromWords(lenient, gate.words, gate.options);
    return safe ? (safe as unknown as Record<string, unknown>) : null;
  }
  const component = componentFor(slot.componentId);
  if (!component) return null;
  const v = validateParams(slot.componentId, component.defaults as Record<string, unknown>);
  return v.params;
}
