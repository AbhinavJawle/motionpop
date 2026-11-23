import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { checkDuration, INTAKE_LIMITS, validateIntake } from './intake';

const f = (name: string, type: string, size = 1000) => ({ name, type, size });

describe('validateIntake', () => {
  it('accepts the supported types by MIME', () => {
    expect(validateIntake(f('a.mp3', 'audio/mpeg'))).toEqual({ ok: true, kind: 'mp3' });
    expect(validateIntake(f('a.wav', 'audio/x-wav'))).toEqual({ ok: true, kind: 'wav' });
    expect(validateIntake(f('a.m4a', 'audio/mp4'))).toEqual({ ok: true, kind: 'm4a' });
    expect(validateIntake(f('a.aac', 'audio/aac'))).toEqual({ ok: true, kind: 'm4a' });
    expect(validateIntake(f('a.webm', 'audio/webm;codecs=opus'))).toEqual({
      ok: true,
      kind: 'webm',
    });
  });

  it('falls back to the extension only when type is empty', () => {
    expect(validateIntake(f('Memo.M4A', ''))).toEqual({ ok: true, kind: 'm4a' });
    expect(validateIntake(f('take.webm', ''))).toEqual({ ok: true, kind: 'webm' });
    expect(validateIntake(f('notes.txt', '')).ok).toBe(false);
    expect(validateIntake(f('noext', '')).ok).toBe(false);
    expect(validateIntake(f('movie.mp4', 'video/mp4'))).toEqual({ ok: true, kind: 'video' });
    expect(validateIntake(f('doc.mp3', 'application/pdf')).ok).toBe(false);
  });

  it('rejects wrong types and empty files with the friendly line', () => {
    const r = validateIntake(f('a.pdf', 'application/pdf'));
    expect(r).toEqual({
      ok: false,
      reason: 'not-audio',
      message: "That doesn't look like audio or video. Try MP4, MOV, WebM, MP3, WAV or M4A.",
    });
    expect(validateIntake(f('a.mp3', 'audio/mpeg', 0))).toMatchObject({
      ok: false,
      reason: 'not-audio',
    });
  });

  it('enforces the 50 MB limit inclusively', () => {
    expect(validateIntake(f('a.mp3', 'audio/mpeg', INTAKE_LIMITS.maxBytes)).ok).toBe(true);
    expect(validateIntake(f('a.mp3', 'audio/mpeg', INTAKE_LIMITS.maxBytes + 1))).toEqual({
      ok: false,
      reason: 'too-large',
      message: "That's a big one. Up to 50 MB of audio, 500 MB of video and 20 minutes for now.",
    });
  });

  it('property: ok implies a known kind and a size within limits', () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.string(),
        fc.integer({ min: -10, max: 200_000_000 }),
        (n, t, s) => {
          const r = validateIntake({ name: n, type: t, size: s });
          if (r.ok) {
            const cap = r.kind === 'video' ? INTAKE_LIMITS.maxVideoBytes : INTAKE_LIMITS.maxBytes;
            expect(s > 0 && s <= cap).toBe(true);
          } else {
            expect(r.message.length).toBeGreaterThan(0);
          }
        },
      ),
    );
  });
});

describe('checkDuration', () => {
  it('accepts up to 20 minutes and rejects longer', () => {
    expect(checkDuration(INTAKE_LIMITS.maxDurationMs)).toEqual({ ok: true });
    expect(checkDuration(INTAKE_LIMITS.maxDurationMs + 1)).toEqual({
      ok: false,
      reason: 'too-long',
      message: "That's a big one. Up to 50 MB and 20 minutes for now.",
    });
  });
});
