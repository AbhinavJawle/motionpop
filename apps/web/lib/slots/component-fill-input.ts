import { skillEntry, type ComponentFillInput } from '@motionpop/ai';
import type { EditorProject, Slot } from '@motionpop/schemas';
import { spokenText } from '@/lib/editor/slot-display';

/**
 * The `component.fill` input for a library component slot (spec 06 R5, spec 09 task 18). One
 * builder for both callers: auto-fill (`purpose: 'autofill'`, on the device, free) and Generate
 * (`purpose: 'generate'`, the cloud, 3 credits). Scenes use `sceneFillInput` in `scene-fill.ts`.
 */
export function componentFillInput(
  project: EditorProject,
  slot: Slot,
  purpose: ComponentFillInput['purpose'],
): ComponentFillInput {
  return {
    purpose,
    componentId: slot.componentId,
    words: spokenText(slot, project.transcript.words),
    prompt: slot.prompt || slot.reason,
    currentParams: slot.params,
    styleId: project.styleId,
    skill: { shotSequence: '', emphasis: skillEntry(slot.skillId)?.useWhen ?? '' },
  };
}
