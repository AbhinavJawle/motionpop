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
  /** Scenes: the cue that lands on a known spoken word (absolute word index). */
  anchor?: { cue: string; word: number };
}

const CURRENCY: ReadonlySet<NumberUnit> = new Set(['$', '£', '€']);
const SENTENCE_END = /[.?!]["')\]]*$/;
const PUNCT_EDGE = /^[^\p{L}\p{N}$£€%]+|[^\p{L}\p{N}%]+$/gu;
/** Inputs each not-yet-built component will need (spec 07 defines the real schemas). */
const NEEDS: Record<string, string[]> = {
  'bar-chart': ['data'],
  'line-chart': ['series'],
  callout: ['title'],
  'map-zoom': ['target'],
};
/** How far back a slot may start before its span (design: at most 4 words). */
const LEAD_WORDS = 4;
/**
 * Scenes land their anchored cue on its word, and an entrance needs about this long before it
 * (stat-punch's number lead is 900 ms). A scene's lead-in stops at the first word this far
 * before its anchor, so it never opens on seconds of empty frame.
 */
const SCENE_LEAD_MS = 900;
/**
 * Time a hook needs after its last word starts: the 0.8 s read time of word-by-word text plus
 * an exit. A closing sentence that ends sooner before the transcript does is not a hook.
 */
const HOOK_TAIL_MS = 1300;
/** hook-statement's line limits (its content schema): at most 14 words and 90 characters. */
const HOOK_MIN_WORDS = 3;
const HOOK_MAX_WORDS = 14;
const HOOK_MAX_CHARS = 90;
/** Sentence openers that make a claim worth a hook-statement (lower case, start of sentence). */
const CLAIM_OPENERS =
  /^(here's|here is|this is|that's|that is|the truth|the problem|the secret|the real|the reason|nobody|no one|everyone|most people|what if|imagine|remember|never|think about)\b/i;

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

/**
 * The spoken line for a hook-statement over words `ws..we` (spec 07 task 27): fillers dropped,
 * trailing `. , ; :` stripped (a question mark stays). Null when it doesn't fit the scene's
 * line limits, so the detector never suggests a line the scene would have to cut.
 */
export function hookLine(words: readonly SlotWord[], ws: number, we: number): string | null {
  const said = words
    .slice(ws, we + 1)
    .filter((w) => !w.filler)
    .map((w) => w.text.trim())
    .filter(Boolean);
  if (said.length < HOOK_MIN_WORDS || said.length > HOOK_MAX_WORDS) return null;
  const line = said.join(' ').replace(/[.,;:]+$/, '');
  return line.length <= HOOK_MAX_CHARS ? line : null;
}

/** First and last word index of every sentence. */
function sentenceRanges(sentence: readonly number[]): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  sentence.forEach((s, i) => {
    const last = out[out.length - 1];
    if (last && sentence[last.start] === s) last.end = i;
    else out.push({ start: i, end: i });
  });
  return out;
}

/**
 * A hook-statement draft (spec 07 task 27): the line as spoken, the line cue on its first word.
 * The slot stays suggested (`needsInput: ['content']`) so auto-fill writes the full score
 * (emphasis, eyebrow, variant); the draft is what the fill keeps when the model can't do better.
 */
function hookCandidate(
  words: readonly SlotWord[],
  range: { start: number; end: number },
  score: number,
  skillId: string,
): Candidate | null {
  const line = hookLine(words, range.start, range.end);
  if (!line) return null;
  const endMs = words[words.length - 1]?.endMs ?? 0;
  if ((words[range.end]?.startMs ?? 0) + HOOK_TAIL_MS > endMs) return null;
  let first = range.start;
  while (first < range.end && words[first]?.filler) first++;
  return {
    wordStart: first,
    wordEnd: range.end,
    score,
    componentId: 'hook-statement',
    skillId,
    params: { content: { line }, images: [] },
    needsInput: ['content'],
    anchor: { cue: 'line', word: first },
  };
}

/**
 * stat-punch content for a number span (spec 07 task 27): big-number's fields as the scene's
 * `content`, the number cue anchored on the word that says it. Ready to render when the label
 * is known; otherwise suggested with `needsInput: ['label']`.
 */
export function statPunchParams(
  span: TaggedSpan,
  words: readonly SlotWord[],
  sentence: readonly number[],
): { params: Record<string, unknown>; needsInput?: string[] } {
  const b = bigNumberParams(span, words, sentence);
  return {
    params: { content: { ...b.params, countFrom: 0 }, images: [] },
    ...(b.needsInput ? { needsInput: b.needsInput } : {}),
  };
}

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
  const ranges = sentenceRanges(sentence);

  // Sentence openers and claims (spec 07 task 27): the opening line, questions to the viewer
  // and sentences that open with a claim become hook-statements. Ranked below every data moment
  // (numbers, comparisons, lists, places, year sequences) and above names, so a sentence with
  // something to show keeps that graphic and a hook fills the plain stretches.
  ranges.forEach((r, k) => {
    const text = words
      .slice(r.start, r.end + 1)
      .filter((w) => !w.filler)
      .map((w) => clean(w.text))
      .join(' ');
    const question = /\?["')\]]*$/.test(words[r.end]?.text ?? '');
    const kind =
      k === 0
        ? { score: 0.58, skill: 'brand-sting' }
        : question
          ? { score: 0.56, skill: 'calm-explanation' }
          : CLAIM_OPENERS.test(text)
            ? { score: 0.55, skill: 'calm-explanation' }
            : null;
    const hook = kind ? hookCandidate(words, r, kind.score, kind.skill) : null;
    if (hook) out.push(hook);
  });

  for (const span of spans) {
    const base = { wordStart: span.wordStart, wordEnd: span.wordEnd };
    switch (span.kind) {
      case 'number': {
        const money = span.unit !== undefined && span.unit !== 'x';
        const compared = comparisons.some((c) => overlaps(c, span) || touches(c, span, sentence));
        const score = money ? (compared ? 0.95 : 0.85) : 0.5;
        // Changed by spec 07 task 27: numbers map to the stat-punch scene (big-number stays
        // registered for saved projects).
        out.push({
          ...base,
          score,
          componentId: 'stat-punch',
          skillId: 'shocking-stat-reveal',
          ...statPunchParams(span, words, sentence),
          anchor: { cue: 'number', word: span.wordStart },
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
        // Changed by spec 07 task 27: a list of 3 or more is a hook-statement over the list's
        // sentence (kinetic-headline is replaced by the scene), when the sentence fits a line.
        if ((span.items ?? 0) >= 3) {
          const s = ranges[sentence[span.wordStart] ?? -1];
          const hook = s ? hookCandidate(words, s, 0.7, 'countdown-ranking') : null;
          if (hook) out.push(hook);
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

/**
 * Widen a candidate back to the sentence's first content word, at most LEAD_WORDS back. A scene
 * (anchored cue) stops at the first word SCENE_LEAD_MS before its anchor (spec 07 task 27).
 */
function leadIn(c: Candidate, words: readonly SlotWord[], sentence: readonly number[]): number {
  let start = c.wordStart;
  const anchorMs = c.anchor ? words[c.anchor.word]?.startMs : undefined;
  for (let i = c.wordStart - 1; i >= Math.max(0, c.wordStart - LEAD_WORDS); i--) {
    if (sentence[i] !== sentence[c.wordStart]) break;
    if (anchorMs !== undefined && anchorMs - (words[start]?.startMs ?? anchorMs) >= SCENE_LEAD_MS)
      break;
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

/**
 * Scene params for a suggestion the AI made (spec 07 task 27, "the AI plans, code enforces"):
 * `slots.detect` picks the moment and the scene, code writes the draft from the words, exactly
 * as the deterministic detector does. A stat-punch needs a tagged number inside its words and a
 * hook-statement a line that fits; otherwise the suggestion is dropped (null), so no number is
 * ever invented. Other components come back unchanged.
 */
export function sceneDraft(
  s: SlotSuggestion,
  words: readonly SlotWord[],
  spans: readonly TaggedSpan[],
): SlotSuggestion | null {
  const withBeat = (
    p: { params: Record<string, unknown>; needsInput?: string[] },
    cue: string,
    word: number,
  ): SlotSuggestion => {
    const rest: SlotSuggestion = { ...s };
    delete rest.needsInput;
    return {
      ...rest,
      params: { ...p.params, beats: [{ cue, word: word - s.wordStart }] },
      ...(p.needsInput ? { needsInput: p.needsInput } : {}),
    };
  };
  if (s.componentId === 'stat-punch') {
    const span = spans.find(
      (x) => x.kind === 'number' && x.wordStart >= s.wordStart && x.wordStart <= s.wordEnd,
    );
    if (!span) return null;
    return withBeat(statPunchParams(span, words, sentenceIndex(words)), 'number', span.wordStart);
  }
  if (s.componentId === 'hook-statement') {
    const line = hookLine(words, s.wordStart, s.wordEnd);
    if (!line) return null;
    let first = s.wordStart;
    while (first < s.wordEnd && words[first]?.filler) first++;
    return withBeat(
      { params: { content: { line }, images: [] }, needsInput: ['content'] },
      'line',
      first,
    );
  }
  return s;
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
    // Scene beats index the slot's own words (the post-pass rebases them if the slot moves).
    params: c.anchor
      ? { ...c.params, beats: [{ cue: c.anchor.cue, word: c.anchor.word - c.wordStart }] }
      : c.params,
    ...(c.needsInput ? { needsInput: c.needsInput } : {}),
  }));
}
