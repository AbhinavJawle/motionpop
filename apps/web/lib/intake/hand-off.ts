import {
  StartDraftSchema,
  type PendingExtraClip,
  type PendingIntake,
  type StartDraft,
} from '@motionpop/schemas';
import { appAudioStore } from '../audio/app-audio-store';
import { validateIntake } from '../audio/intake';
import { sampleInput } from '../pipeline/sample';
import { guessMimeType, isSupportedMediaBinFile } from '../video/media-bin';
import { readDraft, setPending } from './pending';

/** Where the single-graphic line goes once stored (spec 11 §2.5). */
export const PROCESSING_NEW = '/processing/new';
/** Where every other entry point sends the creator: choose, then Create (spec 39 R2.1). */
export const CONFIGURE = '/start/configure';

export type HandOffResult = { ok: true } | { ok: false; message: string };

/**
 * Validates a dropped or chosen file (plus optional extra B-roll / screen-recording / screenshot
 * clips, spec 20 R3.2), stores them locally and leaves the pending intake for Processing.
 */
export async function handOffFile(
  file: File,
  draft: StartDraft = StartDraftSchema.parse({}),
  extraFiles: readonly File[] = [],
): Promise<HandOffResult> {
  const r = validateIntake(file);
  if (!r.ok) return { ok: false, message: r.message };
  try {
    const store = appAudioStore();
    const extraClips: PendingExtraClip[] = [];
    for (const extra of extraFiles.slice(0, 12)) {
      if (!isSupportedMediaBinFile(extra)) continue;
      const ref = await store.put(extra);
      extraClips.push({
        ref,
        name: extra.name.slice(0, 120),
        mimeType: guessMimeType(extra),
        sizeBytes: extra.size,
      });
    }
    await setPending(
      file,
      {
        source: 'upload',
        name: file.name,
        cleanup: true,
        ...(extraClips.length ? { extraClips } : {}),
      },
      draft,
    );
    return { ok: true };
  } catch {
    return { ok: false, message: "Couldn't keep that file in this browser. Try again." };
  }
}

const SECONDARY_NAME_RE =
  /(screen[\s_-]?rec|screencast|screen[\s_-]?shot|b[\s_-]?roll|cutaway|overlay|capture|demo[\s_-]?screen)/i;

/**
 * Multi-file drop helper (spec 20 + spec 48): picks a sensible initial primary A-roll
 * (preferring the first audio/video file that does not look like a screen recording or B-roll;
 * creators can always swap the main talking-head clip on `/start/configure`), and attaches up to
 * 12 remaining files as Media Bin clips.
 */
export async function handOffFiles(
  files: readonly File[],
  draft: StartDraft = StartDraftSchema.parse({}),
): Promise<HandOffResult> {
  if (files.length === 0) return { ok: false, message: 'Pick at least one file.' };
  if (files.length === 1) return handOffFile(files[0]!, draft);
  const audioOrVideo = files.filter(
    (f) =>
      f.type.startsWith('audio/') ||
      f.type.startsWith('video/') ||
      /\.(mp3|wav|m4a|aac|ogg|opus|mp4|mov|webm)$/i.test(f.name),
  );
  if (audioOrVideo.length === 0) {
    return { ok: false, message: 'Include your main talking-head video or voiceover first.' };
  }
  const primary =
    audioOrVideo.find((f) => !SECONDARY_NAME_RE.test(f.name)) ?? audioOrVideo[0]!;
  const extras = files.filter((f) => f !== primary);
  return handOffFile(primary, draft, extras);
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
