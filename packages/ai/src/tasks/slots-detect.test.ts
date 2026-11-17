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
  modelFilmBuild: 'strong',
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
// Changed by spec 07 task 27: detection offers scenes (stat-punch replaces big-number), and
// the model leaves scene params empty because code writes them from the words.
const AI_SLOT: SlotSuggestion = {
  wordStart: 1,
  wordEnd: 5,
  componentId: 'stat-punch',
  skillId: 'shocking-stat-reveal',
  reason: "You said 'our revenue grew forty percent'",
  score: 0.9,
  params: {},
};
/** AI_SLOT after `sceneDraft`: the score written by code, the number cue on "forty". */
const AI_SLOT_DRAFTED: SlotSuggestion = {
  ...AI_SLOT,
  params: {
    content: { value: 40, suffix: '%', decimals: 0, label: 'Our revenue grew', countFrom: 0 },
    images: [],
    beats: [{ cue: 'number', word: 3 }],
  },
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
    const ids = input.components.map((c) => c.id);
    expect(ids.slice(0, 2)).toEqual(['stat-punch', 'hook-statement']);
    // Replaced components are not offered; skills name the scene instead.
    expect(ids).not.toContain('big-number');
    expect(ids).not.toContain('kinetic-headline');
    const stat = input.skills.find((k) => k.id === 'shocking-stat-reveal');
    expect(stat?.worksWith).toEqual(['stat-punch', 'hook-statement']);
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
      // A replaced component is no longer offered, and a skill must fit the scene.
      { ...AI_SLOT, componentId: 'big-number' },
      { ...AI_SLOT, skillId: 'zoom-from-world-to-place' },
      { ...AI_SLOT, wordStart: 4, wordEnd: 3 },
    ];
    expect(keepKnown(slots, WORDS.length)).toEqual([AI_SLOT]);
  });
});

describe('detectSlots', () => {
  it('uses the AI answer when it is valid and known', async () => {
    const r = await detectSlots(router(JSON.stringify({ slots: [AI_SLOT] })), WORDS, SPANS);
    expect(r.source).toBe('ai');
    expect(r.slots).toEqual([AI_SLOT_DRAFTED]);
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
      expect(r.slots[0]?.componentId).toBe('stat-punch');
    }
    const offline = await detectSlots(router(new Error('offline')), WORDS, SPANS);
    expect(offline).toMatchObject({ source: 'local', error: 'offline' });
  });

  it('drops an AI stat-punch with no spoken number in its words', async () => {
    const r = await detectSlots(
      router(JSON.stringify({ slots: [{ ...AI_SLOT, wordStart: 1, wordEnd: 3 }] })),
      WORDS,
      SPANS,
    );
    expect(r).toMatchObject({ source: 'local', error: 'no usable AI suggestions' });
  });

  it('returns nothing for an empty transcript', async () => {
    expect(await detectSlots(router('{}'), [], [])).toEqual({ source: 'local', slots: [] });
  });
});
