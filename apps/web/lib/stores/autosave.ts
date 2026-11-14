import type { EditorProject } from '@motionpop/schemas';
import type { ProjectRepository } from '../projects/repository';
import type { EditorStore } from './editor';

export const AUTOSAVE_QUIET_MS = 500;

/**
 * Saves the project after 500 ms without changes (spec 04 R1.4) and drives the
 * "● Saving…" / "● All changes saved" status. Returns a function that stops autosave and
 * flushes a pending save.
 */
export function startAutosave(
  store: EditorStore,
  repo: ProjectRepository,
  quietMs = AUTOSAVE_QUIET_MS,
): () => Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: EditorProject | null = null;
  let inFlight: Promise<void> = Promise.resolve();

  const flush = () => {
    timer = undefined;
    const project = pending;
    pending = null;
    if (!project) return inFlight;
    inFlight = inFlight
      .then(() => repo.save(project))
      .then(
        () => {
          // A newer change may have arrived while saving; keep showing "Saving…" then.
          if (!pending) store.getState().setSaveStatus('saved');
        },
        () => store.getState().setSaveStatus('error'),
      );
    return inFlight;
  };

  const unsubscribe = store.subscribe((s, prev) => {
    if (!s.project || s.project === prev.project) return;
    // Loading a project is not a change to save.
    if (s.loadCount !== prev.loadCount) {
      pending = null;
      if (timer) clearTimeout(timer);
      timer = undefined;
      return;
    }
    pending = s.project;
    if (s.saveStatus !== 'saving') s.setSaveStatus('saving');
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, quietMs);
  });

  return async () => {
    unsubscribe();
    if (timer) clearTimeout(timer);
    await flush();
  };
}
