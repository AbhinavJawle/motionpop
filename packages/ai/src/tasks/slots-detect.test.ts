import { SlotSuggestionsSchema, type SlotSuggestion } from '@motionpop/schemas';
import { describe, expect, it } from 'vitest';
import { createRouter, type AIProvider, type RouterConfig } from '../router';
import type { SlotWord, TaggedSpan } from '../slots/types';
import { detectSlots, keepKnown, slotsDetectInput } from './slots-detect';

const CONFIG: RouterConfig = {
  routingOverrides: {},
  routingSlotsDetectDeviceMaxWords: 400,
  modelFast: 'fast',
  modelStrong: 'strong',
  killSwitch: false,
};

const TEXT = ['Um,', 'our', 'revenue', 'grew', 'forty', 'percent', 'since', '2020.'];
const WORDS: SlotWord[] = TEXT.map((text, i) => ({
  text,
  startMs: i * 600,
  endMs: i * 600 + 450,
  filler: i === 0,
}));
const SPANS: TaggedSpan[] = [
  { wordStart: 4, wordEnd: 5, kind: 'number', text: 'forty percent', value: 40, unit: '%' },
  { wordStart: 7, wordEnd: 7, kind: 'year', text: '2020.', value: 2020 },
];
const AI_SLOT: SlotSuggestion = {
  wordStart: 1,
  wordEnd: 5,
  componentId: 'big-number',
  skillId: 'shocking-stat-reveal',
  reason: "You said 'our revenue grew forty percent'",
  score: 0.9,
  params: { value: 40, suffix: '%', decimals: 0, label: 'Our revenue grew' },
};

const provider = (text: string | Error): AIProvider => ({
  generate: () =>
    text instanceof Error
      ? Promise.reject(text)
      : Promise.resolve({ text, ranOn: 'device' as const }),
});
const router = (text: string | Error) =>
  createRouter({ provider: provider(text), config: () => CONFIG });

describe('slotsDetectInput', () => {
  it('drops fillers but keeps the original word indices', () => {
    const input = slotsDetectInput(WORDS, SPANS);
    expect(input.words[0]).toEqual([1, 'our', 600, 1050]);
    expect(input.words).toHaveLength(7);
    expect(input.candidates).toEqual(SPANS);
    expect(input.components.map((c) => c.id)).toContain('big-number');
    expect(input.maxSlots).toBeGreaterThanOrEqual(1);
    expect(input.language).toBe('en');
  });
});

describe('keepKnown', () => {
  it('drops unknown components, mismatched skills and out-of-range words', () => {
    const slots = [
      AI_SLOT,
      { ...AI_SLOT, componentId: 'mystery-box' },
      { ...AI_SLOT, skillId: 'no-such-skill' },
      { ...AI_SLOT, wordEnd: 8 },
    ];
    expect(keepKnown(slots, WORDS.length)).toEqual([AI_SLOT]);
  });
});

describe('detectSlots', () => {
  it('uses the AI answer when it is valid and known', async () => {
    const r = await detectSlots(router(JSON.stringify({ slots: [AI_SLOT] })), WORDS, SPANS);
    expect(r.source).toBe('ai');
    expect(r.slots).toEqual([AI_SLOT]);
    if (r.source === 'ai') expect(r.run).toMatchObject({ ranOn: 'device', costCredits: 0 });
  });

  it('falls back to the local detector without a router, on errors and on empty answers', async () => {
    for (const r of [
      await detectSlots(null, WORDS, SPANS),
      await detectSlots(router(new Error('offline')), WORDS, SPANS),
      await detectSlots(router('not json'), WORDS, SPANS),
      await detectSlots(
        router(JSON.stringify({ slots: [{ ...AI_SLOT, componentId: 'mystery-box' }] })),
        WORDS,
        SPANS,
      ),
    ]) {
      expect(r.source).toBe('local');
      expect(SlotSuggestionsSchema.safeParse(r.slots).success).toBe(true);
      expect(r.slots.length).toBeGreaterThan(0);
      expect(r.slots[0]?.componentId).toBe('big-number');
    }
    const offline = await detectSlots(router(new Error('offline')), WORDS, SPANS);
    expect(offline).toMatchObject({ source: 'local', error: 'offline' });
  });

  it('returns nothing for an empty transcript', async () => {
    expect(await detectSlots(router('{}'), [], [])).toEqual({ source: 'local', slots: [] });
  });
});
