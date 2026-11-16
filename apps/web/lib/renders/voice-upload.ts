import { isSafeId, voicePathFor, type EditorProject } from '@motionpop/schemas';
import { audioStore, isIdbAudioRef } from '../audio/audio-store';
import { encodeWav, synthVoice } from '../audio/synth-voice';
import { getStorageClient } from '../firebase/client';
import { synthRate } from '../projects/fixture';

// The voice an export renders (spec 08 R2.1, design §3 step 2): the project's voiceover as a Blob,
// then (cloud and emulator modes) a hashed upload under the owner's `audio/` folder.

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

const CANONICAL_TYPE: Readonly<Record<VoiceExt, string>> = {
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

export class VoiceError extends Error {
  constructor(
    readonly code: 'voice-missing' | 'too-large' | 'network',
    message: string,
  ) {
    super(message);
    this.name = 'VoiceError';
  }
}

/** The project's voiceover as a Blob: a synthesized sample voice, the AudioStore, or a URL. */
export async function resolveVoiceBlob(project: EditorProject): Promise<Blob> {
  const src = project.voiceover.src;
  const rate = synthRate(src);
  if (rate !== null) {
    const samples = synthVoice(project.transcript.words, project.voiceover.durationMs, 1, rate);
    return new Blob([encodeWav(samples, rate)], { type: 'audio/wav' });
  }
  if (isIdbAudioRef(src)) {
    const blob = await audioStore().get(src);
    if (!blob) throw new VoiceError('voice-missing', 'The voiceover is missing from this browser.');
    return blob;
  }
  try {
    const res = await fetch(src);
    if (!res.ok) throw new VoiceError('voice-missing', `The voiceover answered ${res.status}.`);
    return await res.blob();
  } catch (e) {
    if (e instanceof VoiceError) throw e;
    throw new VoiceError('network', 'The voiceover could not be fetched.');
  }
}

/** First 16 hex characters of the SHA-256 of the bytes (the `voice-{hash16}` part of the path). */
export async function hash16(bytes: ArrayBuffer): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(digest.slice(0, 8), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** `users/{uid}/audio/{projectId}/voice-{hash16}.{ext}` (checked against `voicePathFor`). */
export async function voicePathOf(uid: string, projectId: string, blob: Blob): Promise<string> {
  if (!isSafeId(uid) || !isSafeId(projectId)) {
    throw new VoiceError('voice-missing', 'The voiceover path is not valid.');
  }
  const ext = voiceExtFor(blob.type);
  if (!ext) throw new VoiceError('voice-missing', 'This audio format cannot be exported.');
  if (blob.size <= 0) throw new VoiceError('voice-missing', 'The voiceover is empty.');
  if (blob.size > MAX_VOICE_BYTES) throw new VoiceError('too-large', 'The voiceover is too big.');
  const path = `users/${uid}/audio/${projectId}/voice-${await hash16(await blob.arrayBuffer())}.${ext}`;
  if (!voicePathFor(uid, projectId).test(path)) {
    throw new VoiceError('voice-missing', 'The voiceover path is not valid.');
  }
  return path;
}

/**
 * Uploads the voice (cloud and emulator modes) and returns its path. The path holds the content
 * hash, so an object that already exists is the same audio and the upload is skipped.
 */
export async function uploadVoice(uid: string, projectId: string, blob: Blob): Promise<string> {
  const path = await voicePathOf(uid, projectId, blob);
  const ext = voiceExtFor(blob.type);
  try {
    const storage = await getStorageClient();
    const { ref, getMetadata, uploadBytes } = await import('firebase/storage');
    const object = ref(storage, path);
    try {
      await getMetadata(object);
      return path;
    } catch {
      // Not there yet (or not readable): upload it.
    }
    await uploadBytes(object, blob, { contentType: CANONICAL_TYPE[ext ?? 'wav'] });
    return path;
  } catch (e) {
    if (e instanceof VoiceError) throw e;
    throw new VoiceError('network', 'The voiceover could not be uploaded.');
  }
}
