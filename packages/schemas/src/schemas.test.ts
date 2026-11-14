import { describe, expect, it } from 'vitest';
import { JsonPatchOpSchema, SlotSuggestionSchema, TranscriptSchema } from './index';

const word = (i: number) => ({
  i,
  text: 'hi',
  startMs: i * 100,
  endMs: i * 100 + 90,
  conf: 0.9,
  filler: false,
});

describe('schemas', () => {
  it('accepts a valid transcript and rejects bad indices', () => {
    const base = { language: 'en', ranOn: 'device', timingQuality: 'word', cleaned: false };
    expect(TranscriptSchema.safeParse({ ...base, words: [word(0), word(1)] }).success).toBe(true);
    expect(TranscriptSchema.safeParse({ ...base, words: [word(1)] }).success).toBe(false);
    expect(
      TranscriptSchema.safeParse({ ...base, words: [{ ...word(0), startMs: 1.5 }] }).success,
    ).toBe(false);
  });

  it('validates slot suggestions', () => {
    const ok = {
      wordStart: 2,
      wordEnd: 5,
      componentId: 'big-number',
      skillId: 'stat',
      reason: 'grew forty percent',
      score: 0.8,
      params: {},
    };
    expect(SlotSuggestionSchema.safeParse(ok).success).toBe(true);
    expect(SlotSuggestionSchema.safeParse({ ...ok, wordEnd: 1 }).success).toBe(false);
    expect(SlotSuggestionSchema.safeParse({ ...ok, score: 2 }).success).toBe(false);
  });

  it('allows only replace/add/remove patch ops', () => {
    expect(
      JsonPatchOpSchema.safeParse({ op: 'replace', path: '/timing/speed', value: 0.8 }).success,
    ).toBe(true);
    expect(JsonPatchOpSchema.safeParse({ op: 'remove', path: '/data/2' }).success).toBe(true);
    expect(JsonPatchOpSchema.safeParse({ op: 'move', from: '/a', path: '/b' }).success).toBe(false);
    expect(JsonPatchOpSchema.safeParse({ op: 'add', path: 'nope', value: 1 }).success).toBe(false);
  });
});
