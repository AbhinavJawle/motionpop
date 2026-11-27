// Shared by the editor's media uploads (`hybrid-audio-store.ts`, spec 11 design §2.4) and the
// export's uploads (`renders/voice-upload.ts`, spec 08/19/21), so both compute the same
// `users/{uid}/audio/{projectId}/{kind}-{hash16}.{ext}` and
// `users/{uid}/video/{projectId}/{kind}-{hash16}.{ext}` paths for the same bytes.

export type VoiceExt = 'wav' | 'mp3' | 'm4a' | 'webm' | 'ogg';
export type VideoExt = 'mp4' | 'mov' | 'webm';
export type ClipExt = VideoExt | 'png' | 'jpg' | 'webp';

/** Browser MIME types to the extensions `voicePathFor` accepts (the same table the offline route uses). */
const EXT_BY_TYPE: Readonly<Record<string, VoiceExt>> = {
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  'audio/vnd.wave': 'wav',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/m4a': 'm4a',
  'audio/aac': 'm4a',
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
};

export const CANONICAL_TYPE: Readonly<Record<VoiceExt, string>> = {
  wav: 'audio/wav',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  webm: 'audio/webm',
  ogg: 'audio/ogg',
};

const VIDEO_EXT_BY_TYPE: Readonly<Record<string, VideoExt>> = {
  'video/mp4': 'mp4',
  'video/x-m4v': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
};

export const CANONICAL_VIDEO_TYPE: Readonly<Record<VideoExt, string>> = {
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
};

const CLIP_EXT_BY_TYPE: Readonly<Record<string, ClipExt>> = {
  ...VIDEO_EXT_BY_TYPE,
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
};

export const CANONICAL_CLIP_TYPE: Readonly<Record<ClipExt, string>> = {
  ...CANONICAL_VIDEO_TYPE,
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
};

/** The upload limits matching `storage.rules` and intake (security-and-cost.md). */
export const MAX_VOICE_BYTES = 50 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 500 * 1024 * 1024;
export const MAX_CLIP_IMAGE_BYTES = 10 * 1024 * 1024;

/** MIME type without parameters (`audio/webm;codecs=opus` becomes `audio/webm`). */
export function baseType(type: string): string {
  return (type.split(';')[0] ?? '').trim().toLowerCase();
}

/** The extension for an audio blob's type, or null when the server would not accept it. */
export function voiceExtFor(type: string): VoiceExt | null {
  return EXT_BY_TYPE[baseType(type)] ?? null;
}

/** The extension for a source video's type (falling back to filename when browser MIME is empty). */
export function videoExtFor(type: string, name?: string): VideoExt | null {
  const fromType = VIDEO_EXT_BY_TYPE[baseType(type)];
  if (fromType) return fromType;
  if (!name) return null;
  const lower = name.toLowerCase();
  if (lower.endsWith('.mp4') || lower.endsWith('.m4v')) return 'mp4';
  if (lower.endsWith('.mov')) return 'mov';
  if (lower.endsWith('.webm')) return 'webm';
  return null;
}

/** The extension for a Media Bin clip (video or image), matching `mediaClipPathFor` and `storage.rules`. */
export function clipExtFor(type: string, name?: string): ClipExt | null {
  const fromType = CLIP_EXT_BY_TYPE[baseType(type)];
  if (fromType) return fromType;
  if (!name) return null;
  const fromVideo = videoExtFor('', name);
  if (fromVideo) return fromVideo;
  const lower = name.toLowerCase();
  if (lower.endsWith('.png')) return 'png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'jpg';
  if (lower.endsWith('.webp')) return 'webp';
  return null;
}

export function isImageClipExt(ext: ClipExt): boolean {
  return ext === 'png' || ext === 'jpg' || ext === 'webp';
}

/** First 16 hex characters of the SHA-256 of the bytes (the `{kind}-{hash16}` part of the path). */
export async function hash16(bytes: ArrayBuffer): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(digest.slice(0, 8), (b) => b.toString(16).padStart(2, '0')).join('');
}
