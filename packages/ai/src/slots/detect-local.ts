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
  /** Scenes with more than one anchored cue (absolute word indexes); `anchor` is the first. */
  beats?: { cue: string; word: number }[];
}

const CURRENCY: ReadonlySet<NumberUnit> = new Set(['$', '£', '€']);
const SENTENCE_END = /[.?!]["')\]]*$/;
const PUNCT_EDGE = /^[^\p{L}\p{N}$£€%]+|[^\p{L}\p{N}%]+$/gu;
/** Inputs each not-yet-built component will need (spec 07 defines the real schemas). */
const NEEDS: Record<string, string[]> = {
  callout: ['title'],
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

/** Words that say "A against B" (spec 07 task 23). "or" is left out: "more or less". */
const VERSUS_WORDS = new Set(['vs', 'versus', 'against']);
/** Grammar a versus side never starts or ends with. */
const VERSUS_STOP = new Set(
  (
    'a an the to of for in on at by with and or but so than this that these those it its ' +
    'i you we they he she is are was were be do does did should would could can will'
  ).split(' '),
);
/** versus's name limits (its content schema): 1 to 3 words, at most 24 characters. */
const VERSUS_NAME_WORDS = 2;
const VERSUS_NAME_CHARS = 24;

/**
 * The two sides of a versus over words `ws..we` (spec 07 task 23): up to 2 spoken words right
 * before and after the first "vs", "versus" or "against", fillers and grammar skipped, stopping at
 * punctuation. Each side comes with the index of its first word (its cue lands there). Null when
 * either side has no word, so the detector never suggests a versus it can't fill.
 */
export function versusSides(
  words: readonly SlotWord[],
  ws: number,
  we: number,
): { left: string; right: string; leftWord: number; rightWord: number } | null {
  const bare = (t: string) => t.replace(/^[^\p{L}\p{N}$€£]+|[^\p{L}\p{N}%]+$/gu, '');
  const ok = (w: SlotWord | undefined) =>
    !!w && !w.filler && bare(w.text).length > 0 && !VERSUS_STOP.has(bare(w.text).toLowerCase());
  const ends = (w: SlotWord) => /[.,;:!?…]$/.test(w.text.trim());
  for (let i = ws + 1; i < we; i++) {
    if (!VERSUS_WORDS.has(bare(words[i]?.text ?? '').toLowerCase())) continue;
    const before: number[] = [];
    for (let k = i - 1; k >= ws && before.length < VERSUS_NAME_WORDS; k--) {
      if (!ok(words[k]) || (k < i - 1 && ends(words[k] as SlotWord))) break;
      before.unshift(k);
    }
    const after: number[] = [];
    for (let k = i + 1; k <= we && after.length < VERSUS_NAME_WORDS; k++) {
      if (!ok(words[k])) break;
      after.push(k);
      if (ends(words[k] as SlotWord)) break;
    }
    const name = (ix: number[]) => {
      const s = ix.map((k) => bare(words[k]?.text ?? '')).join(' ');
      return s && s.length <= VERSUS_NAME_CHARS ? s[0]!.toUpperCase() + s.slice(1) : null;
    };
    const left = name(before);
    const right = name(after);
    if (left && right) return { left, right, leftWord: before[0]!, rightWord: after[0]! };
  }
  return null;
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

/** chart-story's limits (its content schema): 2 to 6 values, labels and value text that fit. */
const CHART_MIN_ITEMS = 2;
const CHART_MAX_ITEMS = 6;
const CHART_MAX_VALUE = 999_999;
const CHART_MAX_VALUE_CHARS = 8;
const CHART_LABEL_CHARS = 16;
/** Words that introduce a value's label after it ("12 in March"). */
const LABEL_PREPS = new Set(['in', 'for', 'at', 'by', 'during', 'on']);
/** Grammar a label never is (possessives added to the versus list: "Our team shipped 12"). */
const LABEL_STOP = new Set([...VERSUS_STOP, 'our', 'my', 'your', 'their', 'his', 'her', 'then']);

/** The value text a chart shows, as `formatCount` in the motion package writes it. */
const chartText = (v: number, prefix: string, suffix: string, decimals: number) =>
  `${prefix}${v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`;

/**
 * A chart-story draft over words `ws..we` (spec 07 task 24): the tagged numbers in the unit of
 * the first one, in the order spoken, each `v` cue on the word that says it. Labels are the
 * years in the range when there is one per value, else the spoken word nearest before each
 * value (a capitalised one first). A "from X to Y" comparison with no separate numbers gives
 * two values labelled with its own words, "From" and "To". Null when the words don't give 2 to
 * 6 values with labels, so the detector never shows a value or label nobody said.
 */
export function chartDraft(
  words: readonly SlotWord[],
  spans: readonly TaggedSpan[],
  ws: number,
  we: number,
): { params: Record<string, unknown>; beats: { cue: string; word: number }[] } | null {
  const inside = (s: TaggedSpan) => s.wordStart >= ws && s.wordEnd <= we;
  const bare = (t: string) => t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
  let points: { word: number; value: number; unit: NumberUnit | undefined; label?: string }[] =
    spans
      .filter((s) => s.kind === 'number' && s.value !== undefined && inside(s))
      .map((s) => ({ word: s.wordStart, value: s.value as number, unit: s.unit }));
  if (points.length < CHART_MIN_ITEMS) {
    const c = spans.find(
      (s) =>
        s.kind === 'comparison' && s.fromValue !== undefined && s.value !== undefined && inside(s),
    );
    const to = c
      ? words.findIndex(
          (w, i) => i > c.wordStart && i <= c.wordEnd && bare(w.text).toLowerCase() === 'to',
        )
      : -1;
    if (!c || to < 0) return null;
    points = [
      { word: c.wordStart + 1, value: c.fromValue as number, unit: c.unit, label: 'From' },
      { word: to + 1, value: c.value as number, unit: c.unit, label: 'To' },
    ];
  }
  const first = points[0];
  if (!first) return null;
  points = points.filter((p) => p.unit === first.unit).slice(0, CHART_MAX_ITEMS);
  if (points.length < CHART_MIN_ITEMS) return null;
  const big = Math.max(...points.map((p) => Math.abs(p.value)));
  const [div, scale] = big >= 1e9 ? [1e9, 'B'] : big >= 1e6 ? [1e6, 'M'] : [1, ''];
  const values = points.map((p) => Math.round((p.value / div) * 100) / 100);
  if (values.some((v) => v < 0 || v > CHART_MAX_VALUE) || !values.some((v) => v > 0)) return null;
  const unit = first.unit;
  const prefix = unit && CURRENCY.has(unit) ? unit : '';
  const suffix = (unit === '%' || unit === 'x' ? unit : '') + scale;
  const decimals = Math.max(...values.map(decimalsOf));
  if (values.some((v) => chartText(v, prefix, suffix, decimals).length > CHART_MAX_VALUE_CHARS))
    return null;
  const years = spans.filter((s) => s.kind === 'year' && s.value !== undefined && inside(s));
  const sentence = sentenceIndex(words);
  const isValue = (k: number) => points.some((p) => p.word === k);
  const usable = (k: number) => {
    const w = words[k];
    const t = w ? bare(w.text) : '';
    return w && !w.filler && t && !/\d/.test(t) && !LABEL_STOP.has(t.toLowerCase()) ? t : null;
  };
  /**
   * The value's label: a name right after it ("12 features in March"), else the nearest name
   * before it ("Europe recycles 48%"), else the nearest content word before it. Never across
   * another value or the sentence end, so a value never takes its neighbour's label.
   */
  const nearLabel = (at: number): string | null => {
    for (let k = at + 1; k <= Math.min(we, at + 3); k++) {
      if (isValue(k) || sentence[k] !== sentence[at]) break;
      const prev = bare(words[k - 1]?.text ?? '').toLowerCase();
      const t = usable(k);
      if (t && LABEL_PREPS.has(prev) && /^\p{Lu}/u.test(t)) return t;
      if (/[.,;:!?]$/.test(words[k]?.text ?? '')) break;
    }
    const near: string[] = [];
    for (let k = at - 1; k >= Math.max(ws, at - 3); k--) {
      if (isValue(k) || sentence[k] !== sentence[at] || /[.,;:!?]$/.test(words[k]?.text ?? ''))
        break;
      const t = usable(k);
      if (t) near.push(t);
    }
    return near.find((x) => /^\p{Lu}/u.test(x)) ?? near[0] ?? null;
  };
  const byYear = years.length === points.length;
  const labels = points.map((p, k) =>
    byYear ? String(years[k]!.value) : (p.label ?? nearLabel(p.word)),
  );
  const shown = labels.map((l) => (l ? l[0]!.toUpperCase() + l.slice(1) : null));
  if (shown.some((l) => !l || l.length > CHART_LABEL_CHARS)) return null;
  // Two values under one label would be a guess: no chart.
  if (new Set(shown).size !== shown.length) return null;
  return {
    params: {
      ...(byYear ? { variant: 'line' } : {}),
      content: {
        labels: shown,
        values,
        ...(prefix ? { prefix } : {}),
        ...(suffix ? { suffix } : {}),
        decimals,
      },
      images: [],
    },
    beats: points.map((p, k) => ({ cue: `v${k + 1}`, word: p.word })),
  };
}

/** list-stack's limits (its content schema): 3 to 5 items of 1 to 6 words, 40 characters. */
const LIST_MIN_ITEMS = 3;
const LIST_MAX_ITEMS = 5;
const LIST_ITEM_WORDS = 6;
const LIST_ITEM_CHARS = 40;
const LIST_ORDINALS = new Set([
  'first',
  'firstly',
  'second',
  'secondly',
  'third',
  'thirdly',
  'fourth',
  'fifth',
  'finally',
  'lastly',
]);

/**
 * A list-stack draft over words `ws..we` (spec 07 task 33): the items after "first", "second",
 * "third"…, or the parts of "A, B and C", each item its spoken words (fillers and a leading
 * "and"/"or" dropped) with its cue on its first word. Null when the words don't give 3 to 5
 * items that fit, so the detector never shows an item nobody said.
 */
export function listDraft(
  words: readonly SlotWord[],
  ws: number,
  we: number,
): { params: Record<string, unknown>; beats: { cue: string; word: number }[] } | null {
  const bare = (t: string) => t.replace(/^[^\p{L}\p{N}$€£]+|[^\p{L}\p{N}%]+$/gu, '');
  const low = (i: number) => bare(words[i]?.text ?? '').toLowerCase();
  const groups: number[][] = [];
  const ord: number[] = [];
  for (let i = ws; i <= we; i++) if (LIST_ORDINALS.has(low(i))) ord.push(i);
  if (ord.length >= LIST_MIN_ITEMS) {
    ord.forEach((at, k) => {
      const g: number[] = [];
      for (let i = at + 1; i <= Math.min(we, (ord[k + 1] ?? we + 1) - 1); i++) {
        g.push(i);
        if (/[.,;:!?]$/.test(words[i]?.text ?? '')) break;
      }
      groups.push(g);
    });
  } else {
    let g: number[] = [];
    for (let i = ws; i <= we; i++) {
      const sep = low(i) === 'and' || low(i) === 'or';
      if (sep && g.length) {
        groups.push(g);
        g = [];
        continue;
      }
      if (!sep) g.push(i);
      if (/,$/.test(words[i]?.text ?? '')) {
        groups.push(g);
        g = [];
      }
    }
    if (g.length) groups.push(g);
  }
  const items = groups
    .map((g) => g.filter((i) => !words[i]?.filler && bare(words[i]?.text ?? '')))
    .filter((g) => g.length > 0);
  if (items.length < LIST_MIN_ITEMS || items.length > LIST_MAX_ITEMS) return null;
  const texts = items.map((g) => {
    const s = g.map((i) => bare(words[i]?.text ?? '')).join(' ');
    return s[0]!.toUpperCase() + s.slice(1);
  });
  if (
    items.some((g) => g.length > LIST_ITEM_WORDS) ||
    texts.some((t) => t.length > LIST_ITEM_CHARS)
  )
    return null;
  return {
    params: { content: { items: texts }, images: [] },
    beats: items.map((g, k) => ({ cue: `i${k + 1}`, word: g[0] as number })),
  };
}

/** timeline's limits (its content schema): 3 to 6 events of 1 to 6 words, 48 characters. */
const TIMELINE_MIN = 3;
const TIMELINE_MAX = 6;
const EVENT_WORDS = 6;
const EVENT_CHARS = 48;
const EVENT_LEAD = new Set(['and', 'then', 'so', 'but']);
const EVENT_TRAIL = new Set(['in', 'on', 'by', 'of', 'from', 'since', 'until', 'at', 'the', 'and']);

/**
 * A timeline draft over words `ws..we` (spec 07 task 33): the tagged years as dates, each event
 * the spoken words after its year up to the next pause, or, when the year closes its clause
 * ("opened an office in 2023."), the words before it. Each `e` cue lands on its year. Null when
 * fewer than 3 years come with words, so no event is invented.
 */
export function timelineDraft(
  words: readonly SlotWord[],
  spans: readonly TaggedSpan[],
  ws: number,
  we: number,
): { params: Record<string, unknown>; beats: { cue: string; word: number }[] } | null {
  const years = spans
    .filter(
      (s) => s.kind === 'year' && s.value !== undefined && s.wordStart >= ws && s.wordEnd <= we,
    )
    .slice(0, TIMELINE_MAX);
  if (years.length < TIMELINE_MIN) return null;
  const bare = (t: string) => t.replace(/^[^\p{L}\p{N}$€£]+|[^\p{L}\p{N}%]+$/gu, '');
  const ends = (i: number) => /[.,;:!?]["')\]]*$/.test(words[i]?.text ?? '');
  const isYear = (i: number) => years.some((y) => y.wordStart === i);
  const event = (ix: number[], keepEnd: boolean): string | null => {
    let t = ix
      .filter((i) => !words[i]?.filler)
      .map((i) => bare(words[i]?.text ?? ''))
      .filter(Boolean);
    while (t.length && EVENT_LEAD.has(t[0]!.toLowerCase())) t = t.slice(1);
    while (t.length && EVENT_TRAIL.has(t[t.length - 1]!.toLowerCase())) t = t.slice(0, -1);
    while (t.length > EVENT_WORDS || (t.length && t.join(' ').length > EVENT_CHARS))
      t = keepEnd ? t.slice(1) : t.slice(0, -1);
    const s = t.join(' ');
    return s ? s[0]!.toUpperCase() + s.slice(1) : null;
  };
  const events = years.map((y) => {
    const after: number[] = [];
    if (!ends(y.wordEnd))
      for (let i = y.wordEnd + 1; i <= we && !isYear(i); i++) {
        after.push(i);
        if (ends(i)) break;
      }
    if (after.filter((i) => !words[i]?.filler).length >= 2) return event(after, false);
    const before: number[] = [];
    for (let i = y.wordStart - 1; i >= ws && !isYear(i) && !ends(i); i--) before.unshift(i);
    return event(before, true);
  });
  if (events.some((e) => !e)) return null;
  return {
    params: {
      content: { dates: years.map((y) => String(y.value)), events },
      images: [],
    },
    beats: years.map((y, k) => ({ cue: `e${k + 1}`, word: y.wordStart })),
  };
}

/** quote's limits (its content schema): at most 24 words and 140 characters. */
const QUOTE_MAX_WORDS = 24;
const QUOTE_MAX_CHARS = 140;
const OPENS_QUOTE = /^["“]/;
const CLOSES_QUOTE = /["”]["')\].,!?;:]*$/;

/**
 * A quote draft over words `ws..we` (spec 07 task 33): the words inside the first pair of quote
 * marks, as spoken, the quote cue on the first of them. Who said it is left to auto-fill (the
 * words don't say it reliably). Null without a closed quote that fits.
 */
export function quoteDraft(
  words: readonly SlotWord[],
  ws: number,
  we: number,
): { params: Record<string, unknown>; beats: { cue: string; word: number }[] } | null {
  let open = -1;
  for (let i = ws; i <= we; i++)
    if (open < 0 && OPENS_QUOTE.test(words[i]?.text.trim() ?? '')) open = i;
  if (open < 0) return null;
  let close = -1;
  for (let i = open; i <= we && close < 0; i++) {
    // The opening word's own mark doesn't close the quote.
    const t = words[i]?.text.trim() ?? '';
    if (CLOSES_QUOTE.test(i === open ? t.slice(1) : t)) close = i;
  }
  if (close < 0) return null;
  const said = words
    .slice(open, close + 1)
    .filter((w) => !w.filler)
    .map((w) =>
      w.text
        .trim()
        .replace(/^["“]+/, '')
        .replace(/["”]+(?=[.,!?;:]*$)/, ''),
    )
    .filter(Boolean);
  const quote = said.join(' ').replace(/[,;:]+$/, '');
  if (!quote || said.length > QUOTE_MAX_WORDS || quote.length > QUOTE_MAX_CHARS) return null;
  return { params: { content: { quote }, images: [] }, beats: [{ cue: 'quote', word: open }] };
}

/** A chart-story candidate over `ws..we`, or null when the words don't give a chart. */
function chartCandidate(
  words: readonly SlotWord[],
  spans: readonly TaggedSpan[],
  ws: number,
  we: number,
  score: number,
  skillId: string,
): Candidate | null {
  const d = chartDraft(words, spans, ws, we);
  if (!d) return null;
  return {
    wordStart: ws,
    wordEnd: we,
    score,
    componentId: 'chart-story',
    skillId,
    params: d.params,
    // Auto-fill writes the title, takeaway and variant; the draft is what it keeps otherwise.
    needsInput: ['content'],
    anchor: d.beats[0] as { cue: string; word: number },
    beats: d.beats,
  };
}

function candidates(
  words: readonly SlotWord[],
  spans: readonly TaggedSpan[],
  sentence: readonly number[],
): Candidate[] {
  const out: Candidate[] = [];
  const comparisons = spans.filter((s) => s.kind === 'comparison');
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
    // "And this is…", "So here's…": the claim opener comes after a joining word.
    const opener = text.replace(/^(and|but|so|now|okay|ok|well|because)\s+/i, '');
    const kind =
      k === 0
        ? { score: 0.58, skill: 'brand-sting' }
        : question
          ? { score: 0.56, skill: 'calm-explanation' }
          : CLAIM_OPENERS.test(opener)
            ? { score: 0.55, skill: 'calm-explanation' }
            : // Coverage (founder, 2026-11-16: half a video with an empty frame reads as a gimmick):
              // any other sentence that fits a line is a low-ranked hook, so plain stretches get
              // the spoken line when the budget has room and nothing better claims them.
              { score: 0.3, skill: 'calm-explanation' };
    const hook = kind ? hookCandidate(words, r, kind.score, kind.skill) : null;
    if (hook) out.push(hook);
    // Spec 07 task 33: words in quote marks are a quote, ranked above a hook of the same sentence.
    const q = quoteDraft(words, r.start, r.end);
    if (q)
      out.push({
        wordStart: r.start,
        wordEnd: r.end,
        score: 0.62,
        componentId: 'quote',
        skillId: 'calm-explanation',
        params: q.params,
        needsInput: ['content'],
        anchor: q.beats[0] as { cue: string; word: number },
      });
    // Spec 07 task 24: a sentence that gives three or more values in one unit, or two values with
    // a year each, is a chart-story from the first of them to the sentence end. It ranks
    // above a single stat, so "12 in March, 19 in April and 31 in May" becomes one chart.
    const nums = spans.filter(
      (s) => s.kind === 'number' && s.wordStart >= r.start && s.wordEnd <= r.end,
    );
    const yrs = spans.filter(
      (s) => s.kind === 'year' && s.wordStart >= r.start && s.wordEnd <= r.end,
    );
    if (nums.length >= 3 || (nums.length >= 2 && yrs.length === nums.length)) {
      const all = [...nums, ...yrs];
      const chart = chartCandidate(
        words,
        spans,
        Math.min(...all.map((s) => s.wordStart)),
        // To the sentence end: the last value's label often follows it ("31 in May").
        r.end,
        0.9,
        yrs.length ? 'slow-build-trend' : 'countdown-ranking',
      );
      if (chart && (chart.beats?.length ?? 0) >= (yrs.length ? 2 : 3)) out.push(chart);
    }
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
        // Changed by spec 07 task 24: "from X to Y" is a two-value chart-story (bar-chart is
        // replaced by the scene).
        if (span.fromValue !== undefined && span.value !== undefined) {
          const chart = chartCandidate(
            words,
            spans,
            span.wordStart,
            span.wordEnd,
            0.8,
            'contrast-split',
          );
          if (chart) out.push(chart);
        }
        break;
      case 'list':
        // Changed by spec 07 task 33: a list of 3 to 5 items is a list-stack, each item on its
        // first word. A list the scene can't hold (too many or too long items) stays a
        // hook-statement over its sentence (task 27), when the sentence fits a line.
        if ((span.items ?? 0) >= 3) {
          const d = listDraft(words, span.wordStart, span.wordEnd);
          if (d) {
            out.push({
              ...base,
              score: 0.7,
              componentId: 'list-stack',
              skillId: 'countdown-ranking',
              params: d.params,
              needsInput: ['content'],
              anchor: d.beats[0] as { cue: string; word: number },
              beats: d.beats,
            });
            break;
          }
          const s = ranges[sentence[span.wordStart] ?? -1];
          const hook = s ? hookCandidate(words, s, 0.7, 'countdown-ranking') : null;
          if (hook) out.push(hook);
        }
        break;
      case 'place': {
        // Every gazetteer place resolves in the map scene (checked in gazetteer.test.ts); the
        // label is a draft, the scene's own resolver names the place when it fills.
        const place = clean(span.text);
        out.push({
          ...base,
          score: 0.65,
          componentId: 'map-zoom',
          skillId: 'zoom-from-world-to-place',
          params: {
            content: { place, label: place.replace(/\b\p{Ll}/gu, (c) => c.toUpperCase()) },
            images: [],
          },
          anchor: { cue: 'place', word: span.wordStart },
        });
        break;
      }
      // Changed by spec 07 task 24: a 'year' sequence was a line-chart, which chart-story
      // replaces; years with a value each are charted per sentence above.
      case 'year': {
        // Changed by spec 07 task 33: 3 or more years in a run (each in the same sentence as
        // the one before or the next) are a timeline, to the end of the last year's sentence.
        // Ranked below a chart of the same years with values.
        const run = [span];
        for (const y of spans.filter((s) => s.kind === 'year' && s.wordStart > span.wordStart)) {
          const prev = run[run.length - 1] as TaggedSpan;
          if ((sentence[y.wordStart] ?? 0) - (sentence[prev.wordStart] ?? 0) > 1) break;
          run.push(y);
        }
        const before = spans.find(
          (s) =>
            s.kind === 'year' &&
            s.wordStart < span.wordStart &&
            (sentence[span.wordStart] ?? 0) - (sentence[s.wordStart] ?? 0) <= 1,
        );
        if (run.length < TIMELINE_MIN || before) break;
        const lastSentence = sentence[(run[run.length - 1] as TaggedSpan).wordStart];
        let end = (run[run.length - 1] as TaggedSpan).wordEnd;
        while (end + 1 < words.length && sentence[end + 1] === lastSentence) end++;
        const d = timelineDraft(words, spans, span.wordStart, end);
        if (d)
          out.push({
            wordStart: span.wordStart,
            wordEnd: end,
            score: 0.6,
            componentId: 'timeline',
            skillId: 'journey-along-a-timeline',
            params: d.params,
            needsInput: ['content'],
            anchor: d.beats[0] as { cue: string; word: number },
            beats: d.beats,
          });
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
  if (s.componentId === 'chart-story') {
    // Spec 07 task 24: the values as spoken, each `v` cue on its word; no values, no chart.
    const d = chartDraft(words, spans, s.wordStart, s.wordEnd);
    if (!d) return null;
    return {
      ...s,
      params: { ...d.params, beats: d.beats.map((b) => ({ ...b, word: b.word - s.wordStart })) },
      needsInput: ['content'],
    };
  }
  if (s.componentId === 'quote') {
    // Spec 07 task 33: the quoted words as spoken; without quote marks, the slot's first
    // sentence when it fits (the narration reads the words out), else nothing.
    const d =
      quoteDraft(words, s.wordStart, s.wordEnd) ??
      (() => {
        const line = hookLine(words, s.wordStart, s.wordEnd);
        let first = s.wordStart;
        while (first < s.wordEnd && words[first]?.filler) first++;
        return line
          ? {
              params: { content: { quote: line }, images: [] },
              beats: [{ cue: 'quote', word: first }],
            }
          : null;
      })();
    if (!d) return null;
    return {
      ...s,
      params: { ...d.params, beats: d.beats.map((b) => ({ ...b, word: b.word - s.wordStart })) },
      needsInput: ['content'],
    };
  }
  if (s.componentId === 'timeline') {
    // Spec 07 task 33: the years as spoken, each cue on its year; no dated events, no slot.
    const d = timelineDraft(words, spans, s.wordStart, s.wordEnd);
    if (!d) return null;
    return {
      ...s,
      params: { ...d.params, beats: d.beats.map((b) => ({ ...b, word: b.word - s.wordStart })) },
      needsInput: ['content'],
    };
  }
  if (s.componentId === 'list-stack') {
    // Spec 07 task 33: the items as spoken, each cue on its first word; no list, no slot.
    const d = listDraft(words, s.wordStart, s.wordEnd);
    if (!d) return null;
    return {
      ...s,
      params: { ...d.params, beats: d.beats.map((b) => ({ ...b, word: b.word - s.wordStart })) },
      needsInput: ['content'],
    };
  }
  if (s.componentId === 'versus') {
    // Spec 07 task 23: the two sides as spoken, each cue on its side's first word. Auto-fill
    // writes the details and the verdict; without both sides there is nothing to compare.
    const sides = versusSides(words, s.wordStart, s.wordEnd);
    if (!sides) return null;
    return {
      ...s,
      params: {
        content: { left: sides.left, right: sides.right },
        beats: [
          { cue: 'left', word: sides.leftWord - s.wordStart },
          { cue: 'right', word: sides.rightWord - s.wordStart },
        ],
        images: [],
      },
      needsInput: ['content'],
    };
  }
  return s;
}

export function slotBudget(words: readonly SlotWord[]): number {
  const first = words[0];
  const last = words[words.length - 1];
  if (!first || !last) return 0;
  // About one graphic per 3.5 s of voice (was 5 s, which left long empty stretches).
  return Math.max(1, Math.round((last.endMs - first.startMs) / 3500));
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
      ? {
          ...c.params,
          beats: (c.beats ?? [c.anchor]).map((b) => ({ cue: b.cue, word: b.word - c.wordStart })),
        }
      : c.params,
    ...(c.needsInput ? { needsInput: c.needsInput } : {}),
  }));
}
