import {
  PendingIntakeSchema,
  StartDraftSchema,
  type PendingIntake,
  type StartDraft,
} from '@motionpop/schemas';
import { z } from 'zod';
import { audioStore as defaultAudioStore, type AudioStore } from '../audio/audio-store';

/**
 * The hand-off from any entry point (dashboard drop, Start, recorder, sample) to
 * `/processing/new` (spec 11, design §2.5). The audio is written to the local audio store at
 * once and only its ref travels, with the meta and draft, through `sessionStorage`, so a
 * reload or a crash never loses a take (D-065 #18).
 */

export const PENDING_KEY = 'mp:pending-intake';
export const DRAFT_KEY = 'mp:start-draft';

const StoredPendingSchema = z.object({ meta: PendingIntakeSchema, draft: StartDraftSchema });

export interface PendingDeps {
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
  audio: AudioStore;
}

function browserDeps(): PendingDeps {
  return {
    storage: typeof sessionStorage === 'undefined' ? null : sessionStorage,
    audio: defaultAudioStore(),
  };
}

function readJson(storage: PendingDeps['storage'], key: string): unknown {
  try {
    const raw = storage?.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

/** The Start draft, falling back to the defaults on a missing or bad value. */
export function readDraft(deps: Pick<PendingDeps, 'storage'> = browserDeps()): StartDraft {
  const r = StartDraftSchema.safeParse(readJson(deps.storage, DRAFT_KEY) ?? {});
  return r.success ? r.data : StartDraftSchema.parse({});
}

export function writeDraft(
  draft: Partial<StartDraft>,
  deps: Pick<PendingDeps, 'storage'> = browserDeps(),
): StartDraft {
  const next = StartDraftSchema.parse({ ...readDraft(deps), ...draft });
  deps.storage?.setItem(DRAFT_KEY, JSON.stringify(next));
  return next;
}

/** The pending intake's meta and draft, without touching the audio. */
export function peekPending(
  deps: Pick<PendingDeps, 'storage'> = browserDeps(),
): { meta: PendingIntake; draft: StartDraft } | null {
  const r = StoredPendingSchema.safeParse(readJson(deps.storage, PENDING_KEY));
  return r.success ? r.data : null;
}

/** Updates the stored pending meta/draft in place without deleting any referenced blobs (spec 48). */
export function updatePendingMeta(
  meta: PendingIntake,
  draft: StartDraft,
  deps: Pick<PendingDeps, 'storage'> = browserDeps(),
): void {
  deps.storage?.setItem(PENDING_KEY, JSON.stringify({ meta, draft }));
}

/** Points the hand-off at audio that is already stored (a finished recording). */
export async function setPendingRef(
  meta: PendingIntake,
  draft: StartDraft = readDraft(),
  deps: PendingDeps = browserDeps(),
): Promise<void> {
  const prev = peekPending(deps);
  deps.storage?.setItem(PENDING_KEY, JSON.stringify({ meta, draft }));
  // A newer hand-off replaces an older one that never reached Processing.
  if (prev?.meta.ref && prev.meta.ref !== meta.ref) {
    await deps.audio.delete(prev.meta.ref).catch(() => {});
  }
}

/** Stores the blob locally, then hands its ref over. Returns the ref. */
export async function setPending(
  blob: Blob,
  meta: Omit<PendingIntake, 'ref'>,
  draft: StartDraft = readDraft(),
  deps: PendingDeps = browserDeps(),
): Promise<string> {
  const ref = await deps.audio.put(blob);
  await setPendingRef({ ...meta, ref }, draft, deps);
  return ref;
}

/** Hands a script over (no audio yet: its voice is made after Create, spec 39 R2.4). */
export async function setPendingScript(
  meta: Omit<PendingIntake, 'ref'>,
  draft: StartDraft = readDraft(),
  deps: PendingDeps = browserDeps(),
): Promise<void> {
  await setPendingRef(PendingIntakeSchema.parse(meta), draft, deps);
}

/**
 * The pending intake with its audio, or null (nothing pending, or the audio is gone). A typed
 * script has no audio yet (spec 39): its `blob` is null.
 */
export async function takePending(
  deps: PendingDeps = browserDeps(),
): Promise<{ blob: Blob | null; meta: PendingIntake; draft: StartDraft } | null> {
  const p = peekPending(deps);
  if (!p) return null;
  if (!p.meta.ref) return { blob: null, ...p };
  const blob = await deps.audio.get(p.meta.ref);
  if (!blob) {
    deps.storage?.removeItem(PENDING_KEY);
    return null;
  }
  return { blob, ...p };
}

/**
 * Ends the hand-off. `keepAudio` once a project owns the ref (Processing succeeded); otherwise
 * the stored take is deleted too (discarded or cancelled).
 */
export async function clearPending(
  opts: { keepAudio: boolean },
  deps: PendingDeps = browserDeps(),
): Promise<void> {
  const p = peekPending(deps);
  deps.storage?.removeItem(PENDING_KEY);
  if (p?.meta.ref && !opts.keepAudio) await deps.audio.delete(p.meta.ref).catch(() => {});
}
