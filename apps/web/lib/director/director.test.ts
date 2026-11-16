import { enforcePlan, fallbackPlan, planContextOf, tagSpans } from '@motionpop/ai';
import { editorialExplainer, fieldNotes } from '@motionpop/motion/styles';
import type { Slot, SlotSuggestion } from '@motionpop/schemas';
import { describe, expect, it } from 'vitest';
import { demoWords } from '../projects/fixture';
import { applyPlan, directorRequest, planSummary } from './director';

const slot = (over: Partial<Slot>): Slot => ({
  id: 's-1',
  startMs: 0,
  endMs: 3000,
  wordStart: 0,
  wordEnd: 4,
  reason: "You said 'Let's look at the numbers'",
  componentId: 'hook-statement',
  skillId: 'brand-sting',
  prompt: '',
  params: { content: { line: "Let's look at the numbers" }, beats: [], images: [] },
  status: 'suggested',
  notes: [],
  ...over,
});

const SLOTS: Slot[] = [
  slot({}),
  slot({
    id: 's-2',
    startMs: 4200,
    endMs: 8800,
    wordStart: 6,
    wordEnd: 12,
    reason: "You said 'revenue grew forty percent'",
    componentId: 'stat-punch',
    skillId: 'shocking-stat-reveal',
    params: { content: { value: 40, suffix: '%', label: 'Our revenue grew' } },
    status: 'ready',
  }),
  // Not a scene: planned around, never touched.
  slot({
    id: 's-3',
    startMs: 9500,
    endMs: 13000,
    wordStart: 13,
    wordEnd: 18,
    componentId: 'callout',
  }),
];
const SUGGESTIONS = [
  { reason: SLOTS[0]!.reason, componentId: 'hook-statement', score: 0.58 },
  { reason: SLOTS[1]!.reason, componentId: 'stat-punch', score: 0.95 },
] as SlotSuggestion[];
const STRESS = demoWords.map((_, i) => (i === 8 ? 92 : 40));

const request = (style = editorialExplainer as typeof fieldNotes) =>
  directorRequest({
    slots: SLOTS,
    suggestions: SUGGESTIONS,
    transcript: { words: demoWords, prosody: { v: 1, stress: STRESS, pauses: [] } },
    spans: tagSpans(demoWords),
    style,
    energy: 'steady',
    imagesMax: 6,
  });

describe('directorRequest (spec 07 task 27)', () => {
  it('plans the scene slots only, one compact line each', () => {
    const r = request();
    expect(r?.indices).toEqual([0, 1]);
    expect(r?.input.slots).toEqual([
      {
        words: "Let's look at the numbers.",
        kinds: [],
        candidates: ['hook-statement'],
        stress: 50,
        score: 0.58,
      },
      {
        words: 'revenue grew forty percent since 2020. And',
        kinds: ['comparison', 'number', 'year'],
        candidates: ['stat-punch'],
        stress: 92,
        score: 0.95,
      },
    ]);
    expect(r?.input.scenes.map((s) => [s.id, s.strongest, s.variants.length])).toEqual([
      ['hook-statement', 'punch', 3],
      ['stat-punch', 'hero', 3],
    ]);
    // A look's marks are its motifs (Editorial is a full look now: highlighter, arrow, rule, chip).
    expect(r?.input.motifs.length).toBeGreaterThan(0);
    expect(request(fieldNotes)?.input.motifs.length).toBeGreaterThan(0);
  });

  it('is deterministic and returns null when there is nothing to plan', () => {
    expect(request()).toEqual(request());
    expect(
      directorRequest({
        slots: [SLOTS[2]!],
        suggestions: [],
        transcript: { words: demoWords },
        spans: [],
        style: editorialExplainer,
        energy: 'steady',
        imagesMax: 6,
      }),
    ).toBeNull();
  });
});

describe('applyPlan', () => {
  it('writes each planned variant into the score and the energy onto the slot', () => {
    const r = request()!;
    const ctx = planContextOf(r.input, r.seed);
    const plan = enforcePlan(fallbackPlan(ctx), ctx);
    const out = applyPlan(SLOTS, r.indices, plan);
    expect(out[1]).toMatchObject({ params: { variant: 'hero' }, energy: 'lively' });
    expect(out[0]?.energy).toBe('steady');
    expect(out[0]?.params.content).toEqual(SLOTS[0]?.params.content);
    expect(out[2]).toEqual(SLOTS[2]);
    // Inputs are not mutated.
    expect(SLOTS[1]?.params).not.toHaveProperty('variant');
  });

  it('ignores a plan entry for a different scene than the slot has', () => {
    const r = request()!;
    const out = applyPlan(SLOTS, r.indices, {
      slots: [
        { sceneId: 'stat-punch', variant: 'hero', energy: 'hype' },
        { sceneId: 'stat-punch', variant: 'side', energy: 'calm' },
      ],
      peak: 1,
      images: [],
      motifs: [],
      reasons: [],
    });
    expect(out[0]).toEqual(SLOTS[0]);
    expect(out[1]).toMatchObject({ params: { variant: 'side' }, energy: 'calm' });
  });
});

describe('planSummary', () => {
  it('says where the plan came from', () => {
    expect(planSummary({ source: 'device' }, 4200)).toBe('Planned on your device · peak at 4.2s');
    expect(planSummary({ source: 'cloud' })).toBe('Planned in the cloud · free');
    expect(planSummary({ source: 'rules', why: 'limit' })).toBe(
      'Planned with built-in rules (daily limit reached)',
    );
    expect(planSummary({ source: 'rules', why: 'no-model' }, 0)).toBe(
      'Planned with built-in rules · peak at 0.0s',
    );
  });
});
