import { StartDraftSchema, type PendingIntake, type StartDraft } from '@motionpop/schemas';
import { validateIntake } from '../audio/intake';
import { sampleInput } from '../pipeline/sample';
import { readDraft, setPending } from './pending';

/** Where every entry point sends the creator once the audio is stored (spec 11 §2.5). */
export const PROCESSING_NEW = '/processing/new';

export type HandOffResult = { ok: true } | { ok: false; message: string };

/**
 * Validates a dropped or chosen file with the spec 05 intake rules, stores it locally and
 * leaves the pending intake for Processing. The caller navigates on `ok`.
 */
export async function handOffFile(
  file: File,
  draft: StartDraft = StartDraftSchema.parse({}),
): Promise<HandOffResult> {
  const r = validateIntake(file);
  if (!r.ok) return { ok: false, message: r.message };
  try {
    await setPending(file, { source: 'upload', name: file.name, cleanup: true }, draft);
    return { ok: true };
  } catch {
    return { ok: false, message: "Couldn't keep that file in this browser. Try again." };
  }
}

/** "Try a sample": our synthesized voice through the same hand-off. */
export async function handOffSample(draft: StartDraft = readDraft()): Promise<HandOffResult> {
  const s = sampleInput();
  try {
    await setPending(s.file, { source: 'sample', name: s.name, cleanup: true }, draft);
    return { ok: true };
  } catch {
    return { ok: false, message: "Couldn't start the sample in this browser. Try again." };
  }
}

/** A recording already in the audio store (the recorder writes it on stop, R8.4). */
export function recordMeta(ref: string, atMs: number): PendingIntake {
  const d = new Date(atMs);
  const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return { ref, source: 'record', name: `Recording · ${label}`, cleanup: true };
}
