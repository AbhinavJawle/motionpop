import { isSafeId, videoPathFor, voicePathFor, type EditorProject } from '@motionpop/schemas';
import { CANONICAL_TYPE, MAX_VOICE_BYTES, hash16, voiceExtFor } from '../audio/audio-path';
import { appAudioStore } from '../audio/app-audio-store';
import { isIdbAudioRef, type AudioStore } from '../audio/audio-store';
import { firebaseRemoteAudio } from '../audio/firebase-remote-audio';
import {
  AudioElsewhereError,
  isStorageAudioRef,
  type RemoteAudio,
} from '../audio/hybrid-audio-store';
import { encodeWav, synthVoice } from '../audio/synth-voice';
import { synthRate } from '../projects/fixture';

// The voice an export renders (spec 08 R2.1, design §3 step 2): the project's voiceover as a Blob,
// then (cloud and emulator modes) a hashed upload under the owner's `audio/` folder.

export { MAX_VOICE_BYTES, baseType, hash16, voiceExtFor, type VoiceExt } from '../audio/audio-path';

export class VoiceError extends Error {
  constructor(
    readonly code: 'voice-missing' | 'too-large' | 'network',
    message: string,
  ) {
    super(message);
    this.name = 'VoiceError';
  }
}

/**
 * The project's voiceover as a Blob: a synthesized sample voice, the AudioStore (`idb:` and,
 * since spec 11 task 7, `storage:` refs, local copy first), or a URL.
 */
export async function resolveVoiceBlob(
  project: EditorProject,
  store: AudioStore = appAudioStore(),
): Promise<Blob> {
  const src = project.voiceover.src;
  const rate = synthRate(src);
  if (rate !== null) {
    const samples = synthVoice(project.transcript.words, project.voiceover.durationMs, 1, rate);
    return new Blob([encodeWav(samples, rate)], { type: 'audio/wav' });
  }
  if (isIdbAudioRef(src) || isStorageAudioRef(src)) {
    let blob: Blob | null;
    try {
      blob = await store.get(src);
    } catch (e) {
      if (e instanceof AudioElsewhereError) throw new VoiceError('voice-missing', e.message);
      throw e;
    }
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
export async function uploadVoice(
  uid: string,
  projectId: string,
  blob: Blob,
  remote: () => Promise<RemoteAudio> = firebaseRemoteAudio,
): Promise<string> {
  const path = await voicePathOf(uid, projectId, blob);
  const ext = voiceExtFor(blob.type);
  try {
    const storage = await remote();
    // Not there yet (or not readable): upload it.
    if (await storage.exists(path).catch(() => false)) return path;
    await storage.upload(path, blob, CANONICAL_TYPE[ext ?? 'wav']);
    return path;
  } catch (e) {
    if (e instanceof VoiceError) throw e;
    throw new VoiceError('network', 'The voiceover could not be uploaded.');
  }
}

const MAX_VIDEO_BYTES = 150 * 1024 * 1024;
const VIDEO_EXT: Readonly<Record<string, 'mp4' | 'mov' | 'webm'>> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
};
const VIDEO_MIME: Readonly<Record<'mp4' | 'mov' | 'webm', string>> = {
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
};

/** Resolves `project.video.src` into a Blob for export (returns null on voiceover-only projects). */
export async function resolveVideoBlob(
  project: EditorProject,
  store: AudioStore = appAudioStore(),
): Promise<Blob | null> {
  const src = project.video?.src;
  if (!src) return null;
  if (isIdbAudioRef(src) || isStorageAudioRef(src)) {
    return (await store.get(src).catch(() => null)) ?? null;
  }
  try {
    const res = await fetch(src);
    return res.ok ? await res.blob() : null;
  } catch {
    return null;
  }
}

/** Uploads the source video for cloud export (`users/{uid}/video/{projectId}/source-{hash16}.{ext}`). */
export async function uploadVideo(
  uid: string,
  projectId: string,
  blob: Blob,
  remote: () => Promise<RemoteAudio> = firebaseRemoteAudio,
): Promise<string | null> {
  if (!isSafeId(uid) || !isSafeId(projectId)) return null;
  if (blob.size <= 0 || blob.size > MAX_VIDEO_BYTES) return null;
  const ext = VIDEO_EXT[blob.type.split(';')[0]?.trim().toLowerCase() ?? ''] ?? 'mp4';
  const path = `users/${uid}/video/${projectId}/source-${await hash16(await blob.arrayBuffer())}.${ext}`;
  if (!videoPathFor(uid, projectId).test(path)) return null;
  const storage = await remote();
  if (await storage.exists(path).catch(() => false)) return path;
  await storage.upload(path, blob, VIDEO_MIME[ext]);
  return path;
}
