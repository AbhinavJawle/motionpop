// @vitest-environment happy-dom
import { voicePathFor } from '@motionpop/schemas';
import { bigNumberSlot, fixtureProject } from '@motionpop/motion/testing/project-fixture';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  MAX_VOICE_BYTES,
  baseType,
  hash16,
  resolveVoiceBlob,
  voiceExtFor,
  voicePathOf,
  VoiceError,
} from './voice-upload';

describe('voice types', () => {
  it('maps browser types to the accepted extensions, ignoring parameters', () => {
    expect(voiceExtFor('audio/webm;codecs=opus')).toBe('webm');
    expect(voiceExtFor('Audio/MPEG')).toBe('mp3');
    expect(voiceExtFor('audio/x-m4a')).toBe('m4a');
    expect(voiceExtFor('video/mp4')).toBeNull();
    expect(voiceExtFor('')).toBeNull();
    expect(baseType('audio/webm; codecs=opus')).toBe('audio/webm');
  });
});

describe('hash16 and voicePathOf', () => {
  it('hashes to 16 lowercase hex characters, stable per content', async () => {
    const a = await hash16(new TextEncoder().encode('hello').buffer as ArrayBuffer);
    const b = await hash16(new TextEncoder().encode('hello').buffer as ArrayBuffer);
    const c = await hash16(new TextEncoder().encode('hellp').buffer as ArrayBuffer);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('builds a path the server accepts', async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/wav' });
    const path = await voicePathOf('uid1', 'proj-1', blob);
    expect(voicePathFor('uid1', 'proj-1').test(path)).toBe(true);
    expect(path).toMatch(/\.wav$/);
  });

  it('refuses an unknown type, an empty file and a hostile id', async () => {
    await expect(
      voicePathOf('u', 'p', new Blob(['x'], { type: 'video/mp4' })),
    ).rejects.toBeInstanceOf(VoiceError);
    await expect(voicePathOf('u', 'p', new Blob([], { type: 'audio/wav' }))).rejects.toMatchObject({
      code: 'voice-missing',
    });
    await expect(
      voicePathOf('u', '../x', new Blob(['x'], { type: 'audio/wav' })),
    ).rejects.toBeInstanceOf(VoiceError);
  });

  it('refuses a voice over 50 MB without reading it', async () => {
    const big = {
      type: 'audio/wav',
      size: MAX_VOICE_BYTES + 1,
      arrayBuffer: () => {
        throw new Error('read');
      },
    } as unknown as Blob;
    await expect(voicePathOf('u', 'p', big)).rejects.toMatchObject({ code: 'too-large' });
  });

  it('property: every accepted path matches voicePathFor for that owner only', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.stringMatching(/^[A-Za-z0-9_-]{1,40}$/),
        fc.stringMatching(/^[A-Za-z0-9_-]{1,40}$/),
        fc.uint8Array({ minLength: 1, maxLength: 64 }),
        fc.constantFrom('audio/wav', 'audio/mpeg', 'audio/mp4', 'audio/webm', 'audio/ogg'),
        async (uid, pid, bytes, type) => {
          const path = await voicePathOf(uid, pid, new Blob([bytes as BlobPart], { type }));
          expect(voicePathFor(uid, pid).test(path)).toBe(true);
          expect(voicePathFor(`${uid}x`, pid).test(path)).toBe(false);
        },
      ),
      { numRuns: 40 },
    );
  });
});

describe('resolveVoiceBlob', () => {
  it('synthesizes the sample voice as WAV', async () => {
    const project = fixtureProject({ slots: [bigNumberSlot('s', 0, 2000)] });
    const blob = await resolveVoiceBlob({
      ...project,
      voiceover: { ...project.voiceover, src: 'synth:demo' },
    });
    expect(blob.type).toBe('audio/wav');
    expect(blob.size).toBeGreaterThan(44);
  });

  it('reports a missing stored voice', async () => {
    const project = fixtureProject();
    await expect(
      resolveVoiceBlob({ ...project, voiceover: { ...project.voiceover, src: 'idb:audio-nope' } }),
    ).rejects.toMatchObject({ code: 'voice-missing' });
  });
});
