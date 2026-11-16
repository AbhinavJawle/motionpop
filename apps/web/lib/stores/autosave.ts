import type { EditorProject } from '@motionpop/schemas';
import type { ProjectRepository } from '../projects/repository';
import type { EditorStore } from './editor';

export const AUTOSAVE_QUIET_MS = 500;
/** How long a flush waits for the cloud side (pushes, uploads) before letting the user move on. */
export const FLUSH_REMOTE_CAP_MS = 4_000;

export interface AutosaveHandle {
  /**
   * Saves the pending project now and waits for the write, then (capped) for the library's
   * cloud pushes and the open project's audio uploads. Does not unsubscribe (spec 11 §2.3).
   */
  flush(): Promise<void>;
  /** Stops autosave and flushes the pending save (the old behaviour). */
  stop(): Promise<void>;
}

export interface AutosaveOptions {
  quietMs?: number;
  /** Pending audio uploads of the open project (`HybridAudioStore.idle`). */
  uploadsIdle?: () => Promise<void>;
  remoteCapMs?: number;
}

/**
 * Saves the project after 500 ms without changes (spec 04 R1.4) and drives the
 * "● Saving…" / "● All changes saved" status.
 */
export function startAutosave(
  store: EditorStore,
  repo: ProjectRepository & { idle?: () => Promise<void> },
  opts: AutosaveOptions = {},
): AutosaveHandle {
  const quietMs = opts.quietMs ?? AUTOSAVE_QUIET_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: EditorProject | null = null;
  let inFlight: Promise<void> = Promise.resolve();

  const flushLocal = () => {
    if (timer) clearTimeout(timer);
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
    timer = setTimeout(() => void flushLocal(), quietMs);
  });

  return {
    async flush() {
      await flushLocal();
      // Offline, a Firestore commit waits for the server; the push keeps going in the background
      // (the library outlives the editor), so the user is never held longer than the cap.
      const remote = Promise.allSettled([repo.idle?.(), opts.uploadsIdle?.()]);
      let cap: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        remote,
        new Promise((r) => (cap = setTimeout(r, opts.remoteCapMs ?? FLUSH_REMOTE_CAP_MS))),
      ]);
      clearTimeout(cap);
    },
    async stop() {
      unsubscribe();
      await flushLocal();
    },
  };
}

let active: AutosaveHandle | null = null;

/** The open editor registers its autosave here, so the Projects panel can flush before leaving. */
export function setActiveAutosave(handle: AutosaveHandle | null): void {
  active = handle;
}

/** Flushes the open editor's autosave (no-op without one). */
export function flushSave(): Promise<void> {
  return active ? active.flush() : Promise.resolve();
}
