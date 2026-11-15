import fc from 'fast-check';
import { components, scenes } from '@motionpop/motion';
import { SlotSchema, timelineIssues, wordsInRange, type SlotSuggestion } from '@motionpop/schemas';
import { describe, expect, it } from 'vitest';
import { CATALOGUE, SCENES, componentLimits } from './catalogue';
import { detectLocal } from './detect-local';
import { postPass, rebaseBeats, SUGGESTION_GAP_MS, type ValidatedParams } from './post-pass';
import { tagSpans } from './tagger';
import type { SlotWord } from './types';

function sw(text: string, startMs: number, endMs: number, filler = false): SlotWord {
  return { text, startMs, endMs, filler };
}

/** n words of 300 ms spaced `step` ms apart. */
function evenWords(n: number, step = 400): SlotWord[] {
  return Array.from({ length: n }, (_, i) => sw(`w${i}`, i * step, i * step + 300));
}

function sug(
  wordStart: number,
  wordEnd: number,
  score: number,
  componentId = 'big-number',
  extra: Partial<SlotSuggestion> = {},
): SlotSuggestion {
  return {
    wordStart,
    wordEnd,
    componentId,
    skillId: 'shocking-stat-reveal',
    reason: `You said 'x${wordStart}'`,
    score,
    params: { value: 1, label: 'L' },
    ...extra,
  };
}

const DEMO: SlotWord[] = [
  ["Let's", 0, 440],
  ['look', 530, 980],
  ['at', 1100, 1360],
  ['the', 1500, 1840],
  ['numbers.', 2050, 2840],
  ['Our', 3550, 3980],
  ['revenue', 4200, 4780],
  ['grew', 4980, 5480],
  ['forty', 5580, 6050],
  ['percent', 6180, 6830],
  ['since', 6950, 7400],
  ['2020.', 7500, 7800],
  ['And', 8650, 9050],
  ['this', 9200, 9600],
  ['is', 9720, 9980],
  ['only', 10120, 10620],
  ['the', 10750, 11080],
  ['beginning.', 11200, 12020],
  ["Here's", 13100, 13700],
  ['what', 13850, 14350],
  ['comes', 14500, 15130],
  ['next.', 15300, 15740],
].map(([t, s, e]) => sw(t as string, s as number, e as number));

/**
 * Real validation from the motion registry (components and scenes; unknown ids pass through).
 * Scenes keep their params on failure, as the app's validateParams does (spec 07 task 27).
 */
function motionValidate(componentId: string, params: Record<string, unknown>): ValidatedParams {
  const comp = (
    { ...components, ...scenes } as unknown as Record<
      string,
      {
        params: {
          safeParse: (p: unknown) => {
            success: boolean;
            data?: unknown;
            error?: { issues: { path: PropertyKey[] }[] };
          };
        };
        defaults: Record<string, unknown>;
      }
    >
  )[componentId];
  if (!comp) return { params: { ...params }, needsInput: [] };
  const first = comp.params.safeParse(params);
  if (first.success) return { params: first.data as Record<string, unknown>, needsInput: [] };
  const missing = [
    ...new Set((first.error?.issues ?? []).map((i) => String(i.path[0])).filter(Boolean)),
  ];
  if (componentId in scenes) return { params: { ...params }, needsInput: missing };
  const filled = { ...params };
  for (const k of missing) filled[k] = comp.defaults[k];
  const second = comp.params.safeParse(filled);
  return {
    params: (second.success ? (second.data as Record<string, unknown>) : filled) as Record<
      string,
      unknown
    >,
    needsInput: missing,
  };
}

describe('postPass table', () => {
  it('turns the demo into an opening hook and a ready stat-punch', () => {
    // Changed by spec 07 task 27: the number is a stat-punch (was one big-number slot) and the
    // opening line a hook-statement draft for auto-fill. "Here's what comes next" ends the
    // transcript too soon to be read, so it is not a hook.
    const out = postPass({
      words: DEMO,
      suggestions: detectLocal(DEMO, tagSpans(DEMO)),
      validate: motionValidate,
    });
    expect(
      out.map((s) => [s.id, s.componentId, s.status, s.startMs, s.endMs, s.wordStart, s.wordEnd]),
    ).toEqual([
      // Grows at its end up to the gap before the stat, so it overlaps "Our" (3550–3980).
      ['s-1', 'hook-statement', 'suggested', 0, 3800, 0, 5],
      // Leads in from "revenue" (900 ms before "forty") and reaches its ideal at the end only:
      // 4200 + 4600.
      ['s-2', 'stat-punch', 'ready', 4200, 8800, 6, 12],
    ]);
    for (const slot of out) expect(SlotSchema.safeParse(slot).success).toBe(true);
    const stat = out[1];
    expect(stat?.needsInput).toBeUndefined();
    expect(stat?.params).toMatchObject({
      content: { value: 40, suffix: '%', decimals: 0, label: 'Our revenue grew', countFrom: 0 },
      beats: [{ cue: 'number', word: 2 }],
      images: [],
    });
    expect(out[0]?.params).toMatchObject({
      content: { line: "Let's look at the numbers" },
      beats: [{ cue: 'line', word: 0 }],
    });
    expect(out[0]?.needsInput).toEqual(['content']);
  });

  it('rebases scene beats when a slot starts earlier than its suggestion', () => {
    // The suggestion starts at word 9 (the end of the transcript), so reaching the 2400 ms
    // minimum moves the start back to 1500 ms (word 4 is the first word it overlaps); the beat
    // keeps naming word 9.
    const w = evenWords(10); // word 9: 3600..3900
    const [slot] = postPass({
      words: w,
      suggestions: [
        sug(9, 9, 0.9, 'hook-statement', {
          skillId: 'calm-explanation',
          params: { content: { line: 'a b c' }, beats: [{ cue: 'line', word: 0 }] },
        }),
      ],
    });
    expect(slot?.wordStart).toBe(4);
    expect(slot?.params.beats).toEqual([{ cue: 'line', word: 5 }]);
  });

  it('rebaseBeats shifts word beats, drops the ones that leave the slot, keeps the rest', () => {
    const params = {
      content: {},
      beats: [
        { cue: 'a', word: 0 },
        { cue: 'b', word: 3 },
        { cue: 'c', word: 9 },
      ],
    };
    expect(rebaseBeats(params, 2, 6).beats).toEqual([
      { cue: 'a', word: 2 },
      { cue: 'b', word: 5 },
    ]);
    expect(rebaseBeats(params, -1, 10).beats).toEqual([
      { cue: 'b', word: 2 },
      { cue: 'c', word: 8 },
    ]);
    expect(rebaseBeats({ value: 1 }, 3, 4)).toEqual({ value: 1 });
  });

  it('fills defaults and records needsInput with the real big-number schema', () => {
    const out = postPass({
      words: evenWords(12),
      suggestions: [sug(2, 4, 0.9, 'big-number', { params: { value: 5 } })],
      validate: motionValidate,
    });
    expect(out[0]?.status).toBe('suggested');
    expect(out[0]?.needsInput).toEqual(['label']);
    expect(out[0]?.params).toMatchObject({ value: 5, decimals: 0, countFrom: 0 });
    expect(typeof out[0]?.params.label).toBe('string');
  });

  it('merges the suggestion needsInput and keeps unbuilt components suggested', () => {
    const out = postPass({
      words: evenWords(20),
      suggestions: [sug(0, 5, 0.9, 'bar-chart', { needsInput: ['data'] })],
    });
    expect(out[0]).toMatchObject({ status: 'suggested', needsInput: ['data'] });
    const ready = postPass({ words: evenWords(20), suggestions: [sug(0, 5, 0.9, 'bar-chart')] });
    expect(ready[0]?.status).toBe('suggested');
    const built = postPass({ words: evenWords(20), suggestions: [sug(0, 5, 0.9)] });
    expect(built[0]?.status).toBe('ready');
  });

  it('lets the higher score win when suggestions overlap', () => {
    const out = postPass({
      words: evenWords(30),
      suggestions: [sug(2, 8, 0.5), sug(5, 12, 0.9)],
    });
    expect(out).toHaveLength(1);
    expect(out[0]?.reason).toBe("You said 'x5'");
  });

  it('breaks score ties by earlier wordStart', () => {
    const out = postPass({
      words: evenWords(30),
      suggestions: [sug(5, 12, 0.7), sug(2, 8, 0.7)],
    });
    expect(out).toHaveLength(1);
    expect(out[0]?.reason).toBe("You said 'x2'");
  });

  it('drops a suggestion whose own range is closer than 400 ms to a kept slot', () => {
    // word 3 ends at 1500; word 4 starts at 1600: only 100 ms apart.
    const w = evenWords(40, 400);
    const out = postPass({ words: w, suggestions: [sug(0, 3, 0.9), sug(4, 9, 0.5)] });
    expect(out).toHaveLength(1);
    expect(out[0]?.wordStart).toBe(0);
  });

  it('keeps two suggestions that are far enough apart, with the gap enforced after widening', () => {
    const w = evenWords(60, 400);
    const out = postPass({ words: w, suggestions: [sug(0, 1, 0.9), sug(10, 11, 0.8)] });
    expect(out).toHaveLength(2);
    const [a, b] = out;
    expect((b?.startMs ?? 0) - (a?.endMs ?? 0)).toBeGreaterThanOrEqual(SUGGESTION_GAP_MS);
    for (const s of out) expect(s.endMs - s.startMs).toBeGreaterThanOrEqual(2600);
  });

  it('drops a suggestion that cannot reach its minimum inside a tight gap', () => {
    const w = evenWords(40, 400);
    const out = postPass({
      words: w,
      suggestions: [sug(0, 7, 0.95), sug(15, 22, 0.9), sug(12, 12, 0.8)],
    });
    // Slot 0 covers 0..3100 and the word-15 slot starts at 6000, so word 12 (4800) has the
    // free gap [3500, 5600] = 2100 ms < the 2600 ms minimum and is dropped.
    expect(out.map((s) => s.reason)).toEqual(["You said 'x0'", "You said 'x15'"]);
  });

  it('gives every slot its minimum before widening any slot to its ideal (no starving)', () => {
    // Regression (Claude Code review of Kiro run 27): placing and widening one slot at a time
    // let the 0.9 slot grow to its 3600 ms ideal and take the room the 0.8 slot needed.
    const w = evenWords(40, 400);
    const out = postPass({ words: w, suggestions: [sug(0, 0, 0.9), sug(8, 8, 0.8)] });
    expect(out.map((s) => s.reason)).toEqual(["You said 'x0'", "You said 'x8'"]);
    const [a, b] = out;
    expect((b?.startMs ?? 0) - (a?.endMs ?? 0)).toBeGreaterThanOrEqual(SUGGESTION_GAP_MS);
    for (const s of out) expect(s.endMs - s.startMs).toBeGreaterThanOrEqual(2600);
  });

  it('widens a short suggestion to its ideal duration when there is room', () => {
    const out = postPass({ words: evenWords(60), suggestions: [sug(10, 10, 0.9)] });
    expect(out[0]?.endMs).toBeGreaterThan(4000);
    expect((out[0]?.endMs ?? 0) - (out[0]?.startMs ?? 0)).toBe(
      componentLimits('big-number')?.idealMs,
    );
  });

  it('widens backwards when the end is stuck at the transcript end', () => {
    const w = evenWords(10); // 0..3900
    const out = postPass({ words: w, suggestions: [sug(9, 9, 0.9)] });
    expect(out[0]?.endMs).toBe(3900);
    expect((out[0]?.endMs ?? 0) - (out[0]?.startMs ?? 0)).toBe(3600);
  });

  it('drops a suggestion when the whole transcript is shorter than the minimum', () => {
    expect(postPass({ words: evenWords(5), suggestions: [sug(0, 4, 0.9)] })).toEqual([]);
  });

  it('clamps a long suggestion to the component maximum', () => {
    const out = postPass({ words: evenWords(80), suggestions: [sug(0, 60, 0.9)] });
    expect(out).toHaveLength(1);
    expect((out[0]?.endMs ?? 0) - (out[0]?.startMs ?? 0)).toBe(8000);
    expect(out[0]?.wordEnd).toBe(wordsInRange(evenWords(80), 0, 8000)?.wordEnd);
  });

  it('drops unknown components', () => {
    expect(postPass({ words: evenWords(30), suggestions: [sug(1, 6, 0.9, 'nope')] })).toEqual([]);
  });

  it('clamps out-of-range word indices', () => {
    const w = evenWords(30);
    const out = postPass({ words: w, suggestions: [sug(25, 99, 0.9), sug(-3, 0, 0.8)] });
    expect(out.length).toBeGreaterThan(0);
    for (const s of out) expect(s.wordEnd).toBeLessThan(30);
  });

  it('returns nothing for an empty transcript or no suggestions', () => {
    expect(postPass({ words: [], suggestions: [sug(0, 1, 1)] })).toEqual([]);
    expect(postPass({ words: evenWords(10), suggestions: [] })).toEqual([]);
  });

  it('avoids ids that exist already and numbers new ones in timeline order', () => {
    const out = postPass({
      words: evenWords(80),
      suggestions: [sug(40, 41, 0.5), sug(2, 3, 0.9)],
      existingIds: ['s-1', 's-3', 'other'],
    });
    expect(out.map((s) => s.id)).toEqual(['s-2', 's-4']);
    expect(out[0]?.wordStart).toBeLessThan(out[1]?.wordStart ?? 0);
  });

  it('uses injected limits, validate and built', () => {
    const out = postPass({
      words: evenWords(30),
      suggestions: [sug(2, 3, 0.9, 'weird')],
      limits: () => ({ minMs: 1000, idealMs: 1000, maxMs: 1500 }),
      validate: (_id, p) => ({ params: { ...p, extra: true }, needsInput: ['x'] }),
      built: () => true,
    });
    expect(out[0]).toMatchObject({ status: 'suggested', needsInput: ['x'] });
    expect(out[0]?.params).toMatchObject({ extra: true });
    expect((out[0]?.endMs ?? 0) - (out[0]?.startMs ?? 0)).toBeLessThanOrEqual(1500);
  });
});

describe('postPass properties (R3.3)', () => {
  const ids = [...CATALOGUE.map((c) => c.id), ...SCENES.map((c) => c.id), 'nope'];
  const arbWords = fc
    .array(
      fc.record({
        gap: fc.integer({ min: 0, max: 800 }),
        dur: fc.integer({ min: 1, max: 600 }),
        filler: fc.boolean(),
      }),
      { minLength: 1, maxLength: 60 },
    )
    .map((items) => {
      let t = 0;
      return items.map((it, i) => {
        const startMs = t + it.gap;
        t = startMs + it.dur;
        return sw(`w${i}`, startMs, t, it.filler);
      });
    });
  const arbCase = arbWords.chain((words) => {
    const n = words.length;
    const arbSug = fc
      .record({
        wordStart: fc.integer({ min: -3, max: n + 3 }),
        len: fc.integer({ min: -2, max: 30 }),
        componentId: fc.constantFrom(...ids),
        score: fc.integer({ min: 0, max: 20 }).map((x) => x / 20),
        needs: fc.boolean(),
      })
      .map((r): SlotSuggestion => ({
        wordStart: r.wordStart,
        wordEnd: r.wordStart + r.len,
        componentId: r.componentId,
        skillId: 'shocking-stat-reveal',
        reason: 'r',
        score: r.score,
        params: { value: 1 },
        ...(r.needs ? { needsInput: ['label'] } : {}),
      }));
    return fc.tuple(
      fc.constant(words),
      fc.array(arbSug, { maxLength: 25 }),
      fc.array(
        fc.integer({ min: 1, max: 12 }).map((x) => `s-${x}`),
        { maxLength: 8 },
      ),
    );
  });

  function deepFreeze<T>(o: T): T {
    if (o && typeof o === 'object') {
      Object.freeze(o);
      for (const v of Object.values(o)) deepFreeze(v);
    }
    return o;
  }

  let runs = 0;
  let nonEmpty = 0;
  it('keeps every timeline and component rule for random words and suggestions', () => {
    fc.assert(
      fc.property(arbCase, ([words, suggestions, existing]) => {
        runs++;
        const before = JSON.stringify([words, suggestions, existing]);
        deepFreeze(words);
        deepFreeze(suggestions);
        const out = postPass({ words, suggestions, existingIds: existing });
        expect(JSON.stringify([words, suggestions, existing])).toBe(before);
        expect(postPass({ words, suggestions, existingIds: existing })).toEqual(out);
        if (out.length > 0) nonEmpty++;

        const durationMs = (words[words.length - 1] as SlotWord).endMs;
        const lo = (words[0] as SlotWord).startMs;
        expect(
          timelineIssues({ durationMs, slots: out, transcript: { words } }),
          'timelineIssues',
        ).toEqual([]);

        const ids = new Set<string>();
        out.forEach((s, i) => {
          expect(SlotSchema.safeParse(s).success).toBe(true);
          expect(s.startMs).toBeGreaterThanOrEqual(lo);
          expect(s.endMs).toBeLessThanOrEqual(durationMs);
          const lim = componentLimits(s.componentId);
          expect(lim).not.toBeNull();
          expect(s.endMs - s.startMs).toBeGreaterThanOrEqual(lim?.minMs ?? Infinity);
          expect(s.endMs - s.startMs).toBeLessThanOrEqual(lim?.maxMs ?? 0);
          expect(wordsInRange(words, s.startMs, s.endMs)).toEqual({
            wordStart: s.wordStart,
            wordEnd: s.wordEnd,
          });
          expect(existing).not.toContain(s.id);
          expect(ids.has(s.id)).toBe(false);
          ids.add(s.id);
          const prev = out[i - 1];
          if (prev) expect(s.startMs - prev.endMs).toBeGreaterThanOrEqual(SUGGESTION_GAP_MS);
        });
      }),
      { numRuns: 400 },
    );
    expect(runs).toBeGreaterThanOrEqual(400);
    // Guard against a vacuous property: many cases must actually produce slots.
    expect(nonEmpty).toBeGreaterThan(40);
    console.log(`post-pass property runs: ${runs}, with slots: ${nonEmpty}`);
  });

  it('keeps every scene beat on the same spoken word, or drops it (spec 07 task 27)', () => {
    let moved = 0;
    const arbBeats = arbWords.chain((words) => {
      const n = words.length;
      const arbSug = fc
        .record({
          wordStart: fc.integer({ min: 0, max: n - 1 }),
          len: fc.integer({ min: 0, max: 20 }),
          sceneId: fc.constantFrom(...SCENES.map((c) => c.id)),
          score: fc.integer({ min: 0, max: 20 }).map((x) => x / 20),
          beats: fc.array(fc.integer({ min: 0, max: 25 }), { maxLength: 4 }),
        })
        .map((r) => ({
          wordStart: r.wordStart,
          wordEnd: Math.min(n - 1, r.wordStart + r.len),
          componentId: r.sceneId,
          skillId: 'calm-explanation',
          score: r.score,
          params: { content: {}, beats: r.beats.map((word, k) => ({ cue: `c${k}`, word })) },
        }));
      return fc.tuple(
        fc.constant(words),
        fc
          .array(arbSug, { maxLength: 8 })
          .map((list) => list.map((x, i): SlotSuggestion => ({ ...x, reason: `r${i}` }))),
      );
    });
    fc.assert(
      fc.property(arbBeats, ([words, suggestions]) => {
        for (const s of postPass({ words, suggestions })) {
          const sg = suggestions.find((x) => x.reason === s.reason) as SlotSuggestion;
          const count = s.wordEnd - s.wordStart + 1;
          const before = sg.params.beats as { cue: string; word: number }[];
          const after = s.params.beats as { cue: string; word: number }[];
          if (s.wordStart !== sg.wordStart) moved++;
          // Same absolute word for every kept beat; a beat is dropped only when it leaves.
          expect(after).toEqual(
            before
              .map((b) => ({ ...b, word: b.word + sg.wordStart - s.wordStart }))
              .filter((b) => b.word >= 0 && b.word < count),
          );
          for (const b of after) expect(b.word).toBeLessThan(count);
        }
      }),
      { numRuns: 300 },
    );
    // Not vacuous: some slots must actually start on a different word than their suggestion.
    expect(moved).toBeGreaterThan(10);
  });
});

describe('postPass performance', () => {
  it('detects and post-processes 3,000 words quickly', () => {
    const phrase = [
      'Our',
      'revenue',
      'grew',
      'forty',
      'percent',
      'since',
      '2020.',
      'Sales',
      'in',
      'Paris',
      'rose',
      'from',
      '10',
      'to',
      '40',
      'and',
      'that',
      'is',
      'good.',
    ];
    const words = Array.from({ length: 3000 }, (_, i) =>
      sw(phrase[i % phrase.length] as string, i * 400, i * 400 + 300),
    );
    // Warm up the JIT once so the number reflects steady state.
    postPass({ words, suggestions: detectLocal(words, tagSpans(words)) });
    // Changed by spec 07 task 27: the budget is on this process's CPU time, best of 3. Wall time
    // measured the scheduler, not this code: 11–28 ms alone, but 165–219 ms in the full forced
    // suite on 2026-11-15 with every package testing at once. Wall time is still logged.
    let ms = Infinity;
    let wall = Infinity;
    let suggestions: SlotSuggestion[] = [];
    let out: ReturnType<typeof postPass> = [];
    for (let k = 0; k < 3; k++) {
      const t0 = performance.now();
      const c0 = process.cpuUsage();
      suggestions = detectLocal(words, tagSpans(words));
      out = postPass({ words, suggestions, validate: motionValidate });
      const cpu = process.cpuUsage(c0);
      ms = Math.min(ms, (cpu.user + cpu.system) / 1000);
      wall = Math.min(wall, performance.now() - t0);
    }
    console.log(
      `detect + post-pass, 3000 words: ${ms.toFixed(1)} ms CPU, ${wall.toFixed(1)} ms wall (${suggestions.length} suggestions, ${out.length} slots)`,
    );
    expect(out.length).toBeGreaterThan(0);
    expect(
      timelineIssues({ durationMs: 3000 * 400 - 100, slots: out, transcript: { words } }),
    ).toEqual([]);
    expect(ms).toBeLessThan(150);
  });
});
