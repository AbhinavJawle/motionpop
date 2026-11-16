import { promptPrefill, templatePrompt, type Router } from '@motionpop/ai';
import type { Route } from '@/lib/ai/route';
import { setSlotPrompt } from '@/lib/commands';
import { styleFor } from '@/lib/composition/project-to-compile';
import { componentName, spokenText } from '@/lib/editor/slot-display';
import type { EditorStore } from '@/lib/stores/editor';

/**
 * Pre-fills an empty prompt box (spec 09 R6.1). The prompt comes from `prompt.prefill` on the
 * device when the route says the device is ready, else from the deterministic `templatePrompt`.
 * It never reaches the cloud: the task is ONLY_ON_DEVICE with no fallback, and a `cloud` or
 * `disabled` route is treated like "no device" (the template). The text is saved on the slot with
 * `setSlotPrompt`, so Generate, a reload and the Pip panel see the same prompt.
 */
export type PrefillOutcome =
  | { kind: 'filled'; text: string; source: 'device' | 'template' }
  /** The slot is gone, already has a prompt, or the user typed one while the model worked. */
  | { kind: 'skipped' };

export interface PrefillDeps {
  store: EditorStore;
  getRouter: () => Promise<Router | null>;
}

export async function prefillPrompt(
  deps: PrefillDeps,
  slotId: string,
  route: Route,
): Promise<PrefillOutcome> {
  const emptySlot = () => {
    const slot = deps.store.getState().project?.slots.find((s) => s.id === slotId);
    return slot && slot.prompt.trim() === '' ? slot : null;
  };
  const start = emptySlot();
  const project = deps.store.getState().project;
  if (!start || !project) return { kind: 'skipped' };

  const name = componentName(start.componentId);
  const style = styleFor(project);
  const said = spokenText(start, project.transcript.words);
  const template = () => templatePrompt({ componentName: name, styleName: style.name, said });

  let text: string | null = null;
  let source: 'device' | 'template' = 'template';
  if (route.kind === 'device') {
    try {
      const router = await deps.getRouter();
      if (router) {
        const res = await router.run(
          promptPrefill,
          {
            slot: {
              reason: start.reason.slice(0, 300),
              componentId: start.componentId,
              skillId: start.skillId,
              componentName: name,
              said: said.slice(0, 300),
            },
            style: { id: style.id, name: style.name },
          },
          { mode: 'ONLY_ON_DEVICE', allowCloud: false },
        );
        text = res.output.prompt;
        source = 'device';
      }
    } catch {
      // The device could not write one: the template below, never the cloud.
    }
  }
  text ??= template();

  // The user may have typed, or the slot may have gone, while the model worked.
  if (!emptySlot()) return { kind: 'skipped' };
  const ok = deps.store.getState().exec(setSlotPrompt(slotId, text));
  return ok ? { kind: 'filled', text, source } : { kind: 'skipped' };
}
