import { sentenceIndex } from './detect-local';
import { AMBIGUOUS_PLACES, MAX_PLACE_WORDS, PLACES, normalizePlaceKey } from './gazetteer';
import { parseSpokenNumber } from './numbers';
import type { SlotWord, SpanKind, TaggedSpan } from './types';

/**
 * Pre-pass tagger (spec 06 R1). Pure and deterministic.
 *
 * Decisions worth knowing:
 * - Each sentence (split at . ? !, same rule as `sentenceIndex`) is tagged on its own, so no span
 *   crosses a sentence. Filler words are removed first: a span never starts or ends on a filler,
 *   and `text` joins only the non-filler words inside the range.
 * - Names are capitalised sequences. A sentence-initial capital counts only when it is not a
 *   common word ("Then", "Here's", "Our") and the next word is also a capitalised, non-common
 *   word ("Alice Moreau spoke."). A lone sentence-initial capital is never a name.
 * - A lone "one" is not a number ("no one knew"). "from X to Y" is a comparison only when both
 *   are plain numbers, so "from 2019 to 2023" stays two years (a trend, not a bar chart).
 * - Lists need three items: "first … second … third" inside one sentence, or "A, B and C".
 */

interface Sentence {
  /** Non-filler word texts. */
  tokens: string[];
  /** Index into the original words for each token. */
  idx: number[];
}

type Push = (a: number, b: number, kind: SpanKind, extra?: Partial<TaggedSpan>) => void;

const KIND_ORDER: Record<SpanKind, number> = {
  number: 0,
  year: 1,
  place: 2,
  name: 3,
  comparison: 4,
  list: 5,
};

/** The token ends with sentence or clause punctuation (optionally followed by closing quotes). */
const BRK = /[.,;:!?…]["'”’)\]]*$/;
const COMMA = /,["'”’)\]]*$/;
const EDGE = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;

const bare = (t: string): string => t.replace(EDGE, '');
const lower = (t: string): string => bare(t).toLowerCase().replace(/’/g, "'");
const at = (arr: readonly string[], i: number): string => arr[i] ?? '';

const COMPARE_WORDS: ReadonlySet<string> = new Set([
  'grew',
  'grow',
  'grows',
  'growing',
  'rose',
  'rise',
  'rises',
  'rising',
  'fell',
  'fall',
  'falls',
  'falling',
  'dropped',
  'drops',
  'increased',
  'decreased',
  'jumped',
  'surged',
  'soared',
  'climbed',
  'plunged',
  'declined',
  'shrank',
  'versus',
  'vs',
]);

const COMPARE_PHRASES: readonly (readonly string[])[] = [
  ['as', 'opposed', 'to'],
  ['more', 'than'],
  ['less', 'than'],
  ['fewer', 'than'],
  ['greater', 'than'],
  ['higher', 'than'],
  ['lower', 'than'],
  ['bigger', 'than'],
  ['larger', 'than'],
  ['smaller', 'than'],
  ['compared', 'to'],
  ['compared', 'with'],
];

const ORDINALS: ReadonlyMap<string, number> = new Map([
  ['first', 1],
  ['firstly', 1],
  ['second', 2],
  ['secondly', 2],
  ['third', 3],
  ['thirdly', 3],
  ['fourth', 4],
  ['fifth', 5],
  ['sixth', 6],
  ['seventh', 7],
  ['eighth', 8],
  ['ninth', 9],
  ['tenth', 10],
]);

/** Capitalised words that are never (part of) a name. Lowercase, straight apostrophes. */
const COMMON: ReadonlySet<string> = new Set(
  (
    'the a an and but or so if then than that this these those there here where when what which ' +
    'who whom whose why how in on at to of for with without by from as into over under after ' +
    'before because while although though since until about around also just only even still yet ' +
    'already really very maybe perhaps however today tomorrow yesterday tonight now soon later ' +
    'again once next last first second third finally meanwhile suddenly actually basically ' +
    'honestly clearly obviously anyway okay ok yes no not never always sometimes often we you ' +
    "they he she it i me my our your their his her its us them him let's here's there's that's " +
    "what's who's it's i'm i'll i've i'd we're you're they're he's she's don't can't won't isn't " +
    'every each all some many most few both either neither other another such welcome hello hi ' +
    'hey thanks thank please look see imagine consider meet say says said monday tuesday ' +
    'wednesday thursday friday saturday sunday january february march april may june july august ' +
    'september october november december'
  ).split(' '),
);

function startsUpper(token: string): boolean {
  return /^[^\p{L}]*\p{Lu}/u.test(token);
}

const isNameWord = (token: string): boolean => {
  const b = bare(token);
  return /^\p{Lu}/u.test(b) && !COMMON.has(lower(token));
};

function tagPlaces(s: Sentence, push: Push, covered: boolean[]): void {
  const t = s.tokens;
  const n = t.length;
  const norm = t.map(normalizePlaceKey);
  for (let i = 0; i < n;) {
    let matched = 0;
    for (let len = Math.min(MAX_PLACE_WORDS, n - i); len >= 1 && matched === 0; len--) {
      let inner = true;
      for (let k = 0; k < len - 1; k++) if (BRK.test(at(t, i + k))) inner = false;
      if (!inner) continue;
      const key = norm.slice(i, i + len).join(' ');
      if (!PLACES.has(key)) continue;
      if (AMBIGUOUS_PLACES.has(key) && !startsUpper(at(t, i))) continue;
      matched = len;
    }
    // "us" is also a pronoun, so only the written abbreviations "US" and "U.S." count.
    if (matched === 0 && ['US', 'U.S'].includes(bare(at(t, i)))) matched = 1;
    if (matched === 0) {
      i++;
      continue;
    }
    push(i, i + matched - 1, 'place');
    for (let k = i; k < i + matched; k++) covered[k] = true;
    i += matched;
  }
}

function tagNumbers(s: Sentence, push: Push, covered: boolean[]): void {
  const t = s.tokens;
  for (let i = 0; i < t.length;) {
    const r = parseSpokenNumber(t, i);
    if (!r || r.end <= i) {
      i++;
      continue;
    }
    const last = r.end - 1;
    if (r.kind === 'year') {
      push(i, last, 'year', { value: r.value });
    } else if (r.unit === undefined && r.end === i + 1 && lower(at(t, i)) === 'one') {
      // A lone "one" is nearly always a pronoun ("no one knew").
    } else {
      push(i, last, 'number', { value: r.value, ...(r.unit ? { unit: r.unit } : {}) });
    }
    for (let k = i; k <= last; k++) covered[k] = true;
    i = r.end;
  }
}

function tagComparisons(s: Sentence, push: Push): void {
  const t = s.tokens;
  const low = t.map(lower);
  for (let i = 0; i < t.length; i++) {
    const w = low[i] ?? '';
    if (w === 'from') {
      const a = parseSpokenNumber(t, i + 1);
      if (a && a.kind === 'number' && low[a.end] === 'to' && !BRK.test(at(t, a.end - 1))) {
        const b = parseSpokenNumber(t, a.end + 1);
        if (b && b.kind === 'number') {
          const unit = b.unit ?? a.unit;
          push(i, b.end - 1, 'comparison', {
            fromValue: a.value,
            value: b.value,
            ...(unit ? { unit } : {}),
          });
        }
      }
    }
    if (COMPARE_WORDS.has(w)) push(i, i, 'comparison');
    for (const p of COMPARE_PHRASES) {
      let ok = i + p.length <= t.length;
      for (let k = 0; ok && k < p.length; k++) {
        if (low[i + k] !== p[k] || (k < p.length - 1 && BRK.test(at(t, i + k)))) ok = false;
      }
      if (ok) {
        push(i, i + p.length - 1, 'comparison');
        break;
      }
    }
  }
}

function tagLists(s: Sentence, push: Push): void {
  const t = s.tokens;
  const n = t.length;
  const low = t.map(lower);

  // "first … second … third": a chain of consecutive ordinals, running to the sentence end.
  const first = low.findIndex((w) => ORDINALS.get(w) === 1);
  if (first >= 0) {
    let items = 1;
    for (let j = first + 1; j < n; j++) {
      if (ORDINALS.get(low[j] ?? '') === items + 1) items++;
    }
    if (items >= 3) push(first, n - 1, 'list', { items });
  }

  // "A, B and C": the last item follows "and"/"or", earlier items end with commas.
  for (let a = 1; a < n - 1; a++) {
    if ((low[a] !== 'and' && low[a] !== 'or') || BRK.test(at(t, a))) continue;
    let last = a + 1;
    while (last < n - 1 && last - a < 3 && !BRK.test(at(t, last))) last++;
    let items = 1;
    let end = a - 1;
    let start = a - 1;
    for (;;) {
      let s0 = end;
      while (s0 > 0 && end - s0 < 2 && !COMMA.test(at(t, s0 - 1))) s0--;
      items++;
      if (s0 > 0 && COMMA.test(at(t, s0 - 1))) {
        // Comma-delimited item (up to 3 words); keep looking further back.
        start = s0;
        end = s0 - 1;
        continue;
      }
      // Earliest item: no comma before it, so only its last word is certain.
      start = end;
      break;
    }
    if (items >= 3) push(start, last, 'list', { items });
  }
}

function tagNames(s: Sentence, push: Push, covered: boolean[]): void {
  const t = s.tokens;
  const n = t.length;
  const cand = t.map(isNameWord);
  const isCand = (j: number): boolean => j >= 0 && j < n && cand[j] === true && !covered[j];
  for (let i = 0; i < n;) {
    if (!isCand(i) || (i === 0 && !isCand(1))) {
      i++;
      continue;
    }
    let j = i;
    while (!BRK.test(at(t, j)) && isCand(j + 1)) j++;
    push(i, j, 'name');
    i = j + 1;
  }
}

function tagSentence(s: Sentence, out: TaggedSpan[]): void {
  if (s.tokens.length === 0) return;
  const push: Push = (a, b, kind, extra = {}) => {
    out.push({
      wordStart: s.idx[a] ?? 0,
      wordEnd: s.idx[b] ?? 0,
      kind,
      text: s.tokens.slice(a, b + 1).join(' '),
      ...extra,
    });
  };
  const covered = new Array<boolean>(s.tokens.length).fill(false);
  tagPlaces(s, push, covered);
  tagNumbers(s, push, covered);
  tagComparisons(s, push);
  tagLists(s, push);
  tagNames(s, push, covered);
}

/** Tags numbers, years, places, names, comparisons and lists, ordered by start then end. */
export function tagSpans(words: readonly SlotWord[]): TaggedSpan[] {
  const out: TaggedSpan[] = [];
  const sentence = sentenceIndex(words);
  let current: Sentence = { tokens: [], idx: [] };
  let currentId = 0;
  words.forEach((w, i) => {
    const id = sentence[i] ?? 0;
    if (id !== currentId) {
      tagSentence(current, out);
      current = { tokens: [], idx: [] };
      currentId = id;
    }
    if (!w.filler) {
      current.tokens.push(w.text);
      current.idx.push(i);
    }
  });
  tagSentence(current, out);

  return out.sort(
    (a, b) =>
      a.wordStart - b.wordStart ||
      a.wordEnd - b.wordEnd ||
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      (a.text < b.text ? -1 : a.text > b.text ? 1 : 0),
  );
}
