/** Intake checks that run before a file is read (R1.1, R1.2). Pure. */

export const INTAKE_LIMITS = {
  maxBytes: 50 * 1024 * 1024,
  /** Talking-head videos (spec 17): the studio edits the footage itself. */
  maxVideoBytes: 500 * 1024 * 1024,
  maxDurationMs: 20 * 60 * 1000,
} as const;

export type IntakeKind = 'mp3' | 'wav' | 'm4a' | 'webm' | 'video';
export type IntakeFailure = 'not-audio' | 'too-large' | 'too-long';

export type IntakeResult =
  { ok: true; kind: IntakeKind } | { ok: false; reason: IntakeFailure; message: string };

export const INTAKE_MESSAGES: Record<IntakeFailure, string> = {
  'not-audio': "That doesn't look like audio or video. Try MP3, WAV, M4A, MP4 or MOV.",
  'too-large': "That's a big one. Up to 50 MB of audio, 500 MB of video and 20 minutes for now.",
  'too-long': "That's a big one. Up to 50 MB and 20 minutes for now.",
};

const MIME_KINDS: Record<string, IntakeKind> = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/mpeg3': 'mp3',
  'audio/x-mpeg-3': 'mp3',
  'audio/wav': 'wav',
  'audio/wave': 'wav',
  'audio/x-wav': 'wav',
  'audio/vnd.wave': 'wav',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/m4a': 'm4a',
  'audio/aac': 'm4a',
  'audio/x-aac': 'm4a',
  'audio/webm': 'webm',
  'audio/ogg': 'webm',
  'video/mp4': 'video',
  'video/quicktime': 'video',
  'video/webm': 'video',
  'video/x-m4v': 'video',
};

const EXTENSION_KINDS: Record<string, IntakeKind> = {
  mp3: 'mp3',
  wav: 'wav',
  wave: 'wav',
  m4a: 'm4a',
  aac: 'm4a',
  mp4: 'm4a',
  webm: 'webm',
  opus: 'webm',
  ogg: 'webm',
  mov: 'video',
  m4v: 'video',
};

const fail = (reason: IntakeFailure): IntakeResult => ({
  ok: false,
  reason,
  message: INTAKE_MESSAGES[reason],
});

function kindFromMime(type: string): IntakeKind | null {
  // Drop parameters such as "audio/webm;codecs=opus".
  const base = (type.split(';')[0] ?? '').trim().toLowerCase();
  return MIME_KINDS[base] ?? null;
}

function kindFromName(name: string): IntakeKind | null {
  const dot = name.lastIndexOf('.');
  if (dot < 0) return null;
  return (
    EXTENSION_KINDS[
      name
        .slice(dot + 1)
        .trim()
        .toLowerCase()
    ] ?? null
  );
}

/**
 * Accepts MP3, WAV, M4A/AAC and WebM/Opus by MIME type, and falls back to the file extension only
 * when `type` is empty (Safari and Finder often leave it blank for M4A). A non-empty type that is
 * not audio is rejected even if the extension looks right. Empty files are rejected.
 */
export function validateIntake(file: { name: string; type: string; size: number }): IntakeResult {
  const type = file.type.trim();
  const kind = type === '' ? kindFromName(file.name) : kindFromMime(type);
  if (!kind || !Number.isFinite(file.size) || file.size <= 0) return fail('not-audio');
  const limit = kind === 'video' ? INTAKE_LIMITS.maxVideoBytes : INTAKE_LIMITS.maxBytes;
  if (file.size > limit) return fail('too-large');
  return { ok: true, kind };
}

/** Duration is only known after decoding, so it is checked separately with the same limits. */
export function checkDuration(
  durationMs: number,
): { ok: true } | { ok: false; reason: 'too-long'; message: string } {
  if (durationMs > INTAKE_LIMITS.maxDurationMs) {
    return { ok: false, reason: 'too-long', message: INTAKE_MESSAGES['too-long'] };
  }
  return { ok: true };
}
