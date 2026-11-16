'use client';

import { StartDraftSchema, type StartDraft } from '@motionpop/schemas';
import { useCallback, useSyncExternalStore } from 'react';
import { DRAFT_KEY, readDraft, writeDraft } from './pending';

const DEFAULT: StartDraft = StartDraftSchema.parse({});
const listeners = new Set<() => void>();
let cache: { raw: string | null; draft: StartDraft } = { raw: null, draft: DEFAULT };

function snapshot(): StartDraft {
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(DRAFT_KEY);
  } catch {
    raw = null;
  }
  if (raw !== cache.raw) cache = { raw, draft: readDraft() };
  return cache.draft;
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/**
 * The Start draft (title, format, style) shared by `/start` and `/start/record`, kept in
 * `sessionStorage` so a reload keeps it (design §2.5). Defaults during server rendering.
 */
export function useStartDraft(): [StartDraft, (patch: Partial<StartDraft>) => void] {
  const draft = useSyncExternalStore(subscribe, snapshot, () => DEFAULT);
  const update = useCallback((patch: Partial<StartDraft>) => {
    writeDraft(patch);
    listeners.forEach((fn) => fn());
  }, []);
  return [draft, update];
}
