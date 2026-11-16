// Shared by the editor's audio uploads (`hybrid-audio-store.ts`, spec 11 design §2.4) and the
// export's voice upload (`renders/voice-upload.ts`, spec 08), so both compute the same
// `users/{uid}/audio/{projectId}/{kind}-{hash16}.{ext}` path for the same bytes.

export type VoiceExt = 'wav' | 'mp3' | 'm4a' | 'webm' | 'ogg';

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

/** The upload limit of the Storage rule and the route (security-and-cost.md). */
export const MAX_VOICE_BYTES = 50 * 1024 * 1024;

/** MIME type without parameters (`audio/webm;codecs=opus` becomes `audio/webm`). */
export function baseType(type: string): string {
  return (type.split(';')[0] ?? '').trim().toLowerCase();
}

/** The extension for a blob's type, or null when the server would not accept it. */
export function voiceExtFor(type: string): VoiceExt | null {
  return EXT_BY_TYPE[baseType(type)] ?? null;
}

/** First 16 hex characters of the SHA-256 of the bytes (the `voice-{hash16}` part of the path). */
export async function hash16(bytes: ArrayBuffer): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(digest.slice(0, 8), (b) => b.toString(16).padStart(2, '0')).join('');
}
