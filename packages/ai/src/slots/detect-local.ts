import type { SlotSuggestion } from '@motionpop/schemas';
import type { NumberUnit, SlotWord, TaggedSpan } from './types';

/**
 * Deterministic slot detector (spec 06 R2.2): the offline fallback and the default until AI
 * Logic runs `slots.detect`. Pure: same words and spans → same suggestions.
 */

export interface DetectOptions {
  /** Override the budget (default: one slot per 5 s of speech, at least one). */
  maxSlots?: number;
}

interface Candidate {
  wordStart: number;
  wordEnd: number;
  score: number;
  componentId: string;
  skillId: string;
  params: Record<string, unknown>;
  needsInput?: string[];
}

const CURRENCY: ReadonlySet<NumberUnit> = new Set(['$', '£', '€']);
const SENTENCE_END = /[.?!]["')\]]*$/;
const PUNCT_EDGE = /^[^\p{L}\p{N}$£€%]+|[^\p{L}\p{N}%]+$/gu;
/** Inputs each not-yet-built component will need (spec 07 defines the real schemas). */
const NEEDS: Record<string, string[]> = {
  'kinetic-headline': ['headline'],
  'bar-chart': ['data'],
  'line-chart': ['series'],
  callout: ['title'],
  'map-zoom': ['target'],
};
/** How far back a slot may start before its span (design: at most 4 words). */
const LEAD_WORDS = 4;

/** Sentence index for every word (sentences end at . ? !). */
export function sentenceIndex(words: readonly SlotWord[]): number[] {
  const out: number[] = [];
  let s = 0;
  for (const w of words) {
    out.push(s);
    if (SENTENCE_END.test(w.text)) s++;
  }
  return out;
}

const clean = (text: string): string => text.replace(PUNCT_EDGE, '');
const overlaps = (a: { wordStart: number; wordEnd: number }, b: typeof a): boolean =>
  a.wordStart <= b.wordEnd && b.wordStart <= a.wordEnd;

/** Up to `max` content words right before `index` in the same sentence, title-cased. */
function labelBefore(
  words: readonly SlotWord[],
  sentence: readonly number[],
  index: number,
  max = 3,
): string {
  const picked: string[] = [];
  for (let i = index - 1; i >= 0 && picked.length < max; i--) {
    if (sentence[i] !== sentence[index]) break;
    const w = words[i];
    if (!w || w.filler) continue;
    const t = clean(w.text);
    if (t) picked.unshift(t);
  }
  const label = picked.join(' ');
  return label ? label.charAt(0).toUpperCase() + label.slice(1) : '';
}

const decimalsOf = (v: number): number => {
  const s = String(v);
  const dot = s.indexOf('.');
  return dot < 0 ? 0 : Math.min(2, s.length - dot - 1);
};

/** big-number params for a number span (R2.1): `{ value, prefix?, suffix?, decimals, label }`. */
export function bigNumberParams(
  span: TaggedSpan,
  words: readonly SlotWord[],
  sentence: readonly number[],
): { params: Record<string, unknown>; needsInput?: string[] } {
  let value = span.value ?? 0;
  let scale = '';
  if (Math.abs(value) >= 1e9) [value, scale] = [value / 1e9, 'B'];
  else if (Math.abs(value) >= 1e6) [value, scale] = [value / 1e6, 'M'];
  value = Math.round(value * 100) / 100;
  const unit = span.unit;
  const prefix = unit && CURRENCY.has(unit) ? unit : undefined;
  const suffix = (unit === '%' || unit === 'x' ? unit : '') + scale || undefined;
  const label = labelBefore(words, sentence, span.wordStart).slice(0, 48).trim();
  const params: Record<string, unknown> = {
    value,
    ...(prefix ? { prefix } : {}),
    ...(suffix ? { suffix } : {}),
    decimals: decimalsOf(value),
    ...(label ? { label } : {}),
  };
  return label ? { params } : { params, needsInput: ['label'] };
}

function candidates(
  words: readonly SlotWord[],
  spans: readonly TaggedSpan[],
  sentence: readonly number[],
): Candidate[] {
  const out: Candidate[] = [];
  const comparisons = spans.filter((s) => s.kind === 'comparison');
  const years = spans.filter((s) => s.kind === 'year');

  for (const span of spans) {
    const base = { wordStart: span.wordStart, wordEnd: span.wordEnd };
    switch (span.kind) {
      case 'number': {
        const money = span.unit !== undefined && span.unit !== 'x';
        const compared = comparisons.some((c) => overlaps(c, span) || touches(c, span, sentence));
        const score = money ? (compared ? 0.95 : 0.85) : 0.5;
        out.push({
          ...base,
          score,
          componentId: 'big-number',
          skillId: 'shocking-stat-reveal',
          ...bigNumberParams(span, words, sentence),
        });
        break;
      }
      case 'comparison':
        if (span.fromValue !== undefined && span.value !== undefined) {
          out.push({
            ...base,
            score: 0.8,
            componentId: 'bar-chart',
            skillId: 'contrast-split',
            params: {},
            needsInput: NEEDS['bar-chart'],
          });
        }
        break;
      case 'list':
        if ((span.items ?? 0) >= 3) {
          out.push({
            ...base,
            score: 0.7,
            componentId: 'kinetic-headline',
            skillId: 'countdown-ranking',
            params: {},
            needsInput: NEEDS['kinetic-headline'],
          });
        }
        break;
      case 'place':
        out.push({
          ...base,
          score: 0.65,
          componentId: 'map-zoom',
          skillId: 'zoom-from-world-to-place',
          params: {},
          needsInput: NEEDS['map-zoom'],
        });
        break;
      case 'year': {
        // A sequence: the first year of ≥ 2 in one sentence covers them all.
        const same = years.filter((y) => sentence[y.wordStart] === sentence[span.wordStart]);
        if (same.length >= 2 && same[0] === span) {
          const last = same[same.length - 1] as TaggedSpan;
          out.push({
            wordStart: span.wordStart,
            wordEnd: last.wordEnd,
            score: 0.6,
            componentId: 'line-chart',
            skillId: 'slow-build-trend',
            params: {},
            needsInput: NEEDS['line-chart'],
          });
        }
        break;
      }
      case 'name':
        out.push({
          ...base,
          score: 0.4,
          componentId: 'callout',
          skillId: 'calm-explanation',
          params: {},
          needsInput: NEEDS.callout,
        });
        break;
    }
  }
  return out;
}

/** A comparison word right before the number in the same sentence ("grew forty percent"). */
function touches(c: TaggedSpan, n: TaggedSpan, sentence: readonly number[]): boolean {
  return (
    sentence[c.wordStart] === sentence[n.wordStart] &&
    c.wordEnd < n.wordStart &&
    n.wordStart - c.wordEnd <= 3
  );
}

/** Widen a candidate back to the sentence's first content word, at most LEAD_WORDS back. */
function leadIn(c: Candidate, words: readonly SlotWord[], sentence: readonly number[]): number {
  let start = c.wordStart;
  for (let i = c.wordStart - 1; i >= Math.max(0, c.wordStart - LEAD_WORDS); i--) {
    if (sentence[i] !== sentence[c.wordStart]) break;
    start = i;
  }
  while (start < c.wordStart && words[start]?.filler) start++;
  return start;
}

/** `You said '<exact words>'` with fillers dropped and trailing punctuation stripped. */
export function reasonFor(words: readonly SlotWord[], wordStart: number, wordEnd: number): string {
  const said = words
    .slice(wordStart, wordEnd + 1)
    .filter((w) => !w.filler)
    .map((w) => w.text)
    .join(' ')
    .replace(/[.,;:!?]+$/, '');
  return `You said '${said}'`;
}

export function slotBudget(words: readonly SlotWord[]): number {
  const first = words[0];
  const last = words[words.length - 1];
  if (!first || !last) return 0;
  return Math.max(1, Math.round((last.endMs - first.startMs) / 5000));
}

export function detectLocal(
  words: readonly SlotWord[],
  spans: readonly TaggedSpan[],
  opts: DetectOptions = {},
): SlotSuggestion[] {
  if (words.length === 0) return [];
  const sentence = sentenceIndex(words);
  const budget = opts.maxSlots ?? slotBudget(words);
  const ranked = candidates(words, spans, sentence)
    .filter((c) => c.wordStart >= 0 && c.wordEnd < words.length && c.wordEnd >= c.wordStart)
    // Best score first; earlier and shorter break ties so the order is total (deterministic).
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.wordStart - b.wordStart ||
        a.wordEnd - b.wordEnd ||
        a.componentId.localeCompare(b.componentId),
    );

  const picked: Candidate[] = [];
  for (const c of ranked) {
    if (picked.length >= budget) break;
    if (picked.some((p) => overlaps(p, c))) continue;
    picked.push({ ...c });
  }

  // Pick on the spans themselves, then widen each lead-in only up to the previous pick, so a
  // lead-in never swallows a neighbouring moment.
  picked.sort((a, b) => a.wordStart - b.wordStart);
  for (let k = 0; k < picked.length; k++) {
    const c = picked[k] as Candidate;
    const floor = k > 0 ? (picked[k - 1] as Candidate).wordEnd + 1 : 0;
    c.wordStart = Math.max(floor, leadIn(c, words, sentence));
  }

  return picked.map((c) => ({
    wordStart: c.wordStart,
    wordEnd: c.wordEnd,
    componentId: c.componentId,
    skillId: c.skillId,
    reason: reasonFor(words, c.wordStart, c.wordEnd),
    score: c.score,
    params: c.params,
    ...(c.needsInput ? { needsInput: c.needsInput } : {}),
  }));
}
