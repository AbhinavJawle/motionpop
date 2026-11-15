import { skillEntry, type ComponentFillInput } from '@motionpop/ai';
import {
  CATALOGUE_KEY,
  catalogueSummary,
  exemplars,
  exemplarText,
  gateRepairText,
  gateSlot,
  pickExemplars,
  repairable,
  safeScoreFromWords,
  type ExemplarKind,
  type GateOptions,
  type Scene,
  type SceneScore,
} from '@motionpop/motion';
import { sceneTiming } from '@motionpop/motion/compiler';
import type { EditorProject, Slot } from '@motionpop/schemas';
import { styleFor } from '@/lib/composition/project-to-compile';

/** The gate for one scene slot, built like the preview builds it (same words, look, format). */
export interface SceneGate {
  options: GateOptions;
  /** The slot's spoken words; beat index `k` is `words[k]`. */
  words: string[];
  /** Repair text for the router's check, or null when the score passes. */
  check: (params: unknown) => string | null;
  /** Whether a score passes the repairable gates. */
  passes: (params: unknown) => boolean;
}

export function sceneGate(
  scene: Scene<unknown>,
  project: EditorProject,
  slot: Slot,
  doc?: Document,
): SceneGate {
  const { text, ...timing } = sceneTiming(slot, project.transcript);
  const style = styleFor(project);
  const options: GateOptions = {
    slot: slot.id,
    format: project.format,
    style,
    // The runtime passes the style as the look too (a plain pack falls back), so the gate does.
    look: style,
    durationMs: slot.endMs - slot.startMs,
    ...timing,
    ...((slot.energy ?? project.energy) ? { energy: slot.energy ?? project.energy } : {}),
    ...(doc ? { doc } : {}),
  };
  return {
    options,
    words: text,
    check: (params) => gateRepairText(gateSlot(scene, params, options)),
    passes: (params) => !gateSlot(scene, params, options).some(repairable),
  };
}

/** Which examples fit the slot: a number, a list, or a plain statement. */
function exemplarKind(slot: Slot): ExemplarKind {
  if (slot.componentId === 'stat-punch') return 'number';
  if (slot.skillId === 'countdown-ranking') return 'list';
  return 'statement';
}

/**
 * The `component.fill` input for a scene slot (spec 07 task 27, ai-tasks.md §3): the scene's
 * catalogue entry, the slot's words with their indexes (beats name them), and the 2 closest
 * hand-approved examples. Auto-fill only: on the device, free.
 */
export function sceneFillInput(
  scene: Scene<unknown>,
  project: EditorProject,
  slot: Slot,
): ComponentFillInput {
  const words = project.transcript.words.slice(slot.wordStart, slot.wordEnd + 1).map((w) => w.text);
  const examples = pickExemplars(exemplars[scene.id] ?? [], {
    kind: exemplarKind(slot),
    wordCount: words.length,
  }).map(exemplarText);
  return {
    purpose: 'autofill',
    componentId: scene.id,
    words: words.join(' ').slice(0, 2000),
    scene: {
      brief: `${catalogueSummary([scene])}\n${CATALOGUE_KEY}`.slice(0, 1500),
      indexedWords: words
        .map((w, i) => `${i}:${w}`)
        .join(' ')
        .slice(0, 3000),
      ...(examples.length ? { examples: examples.filter((e) => e.length <= 700) } : {}),
    },
    prompt: (slot.prompt || slot.reason).slice(0, 500),
    currentParams: slot.params,
    styleId: project.styleId,
    skill: { shotSequence: '', emphasis: (skillEntry(slot.skillId)?.useWhen ?? '').slice(0, 600) },
  };
}

/**
 * The safe default for a scene slot no model could fill (spec 07 R1.4): the detector's draft
 * from the words when it passes the gates, else `safeScoreFromWords`. Never the scene's example
 * content, so nothing the narrator didn't say is shown. Null when the words give nothing.
 */
export function sceneFallback(
  scene: Scene<unknown>,
  slot: Slot,
  gate: SceneGate,
): Record<string, unknown> | null {
  const draft = scene.params.safeParse(slot.params);
  if (draft.success && gate.passes(draft.data))
    return draft.data as unknown as Record<string, unknown>;
  const safe: SceneScore<unknown> | null = safeScoreFromWords(scene, gate.words, gate.options);
  return safe ? (safe as unknown as Record<string, unknown>) : null;
}
