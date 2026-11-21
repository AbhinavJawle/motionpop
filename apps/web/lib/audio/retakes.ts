/**
 * Retakes in a raw talking-head recording (spec 28 R2): repeated attempts at the same line,
 * false starts, restarts inside a sentence and spoken asides ("let me do that again"). Creators
 * repeat a line until it is right, so the LAST take of a line is kept and earlier ones are cut.
 * Pure: words in, word-index ranges out.
 */
import type { Word } from '@motionpop/schemas';

export type RetakeKind = 'retake' | 'ramble';

export interface WordCut {
  /** First and last word index (inclusive) of the removed range. */
  from: number;
  to: number;
  kind: RetakeKind;
  reason: string;
}

export interface Phrase {
  /** Word indices (inclusive). */
  from: number;
  to: number;
  tokens: string[];
  startMs: number;
  endMs: number;
}

/** A gap this long between two words ends a phrase even without punctuation. */
const PHRASE_GAP_MS = 650;
/** Takes further apart than this are separate lines, not retakes. */
const RETAKE_WINDOW_MS = 30_000;

/** Lowercase, punctuation-free token; tense and plural endings folded so "used" ≈ "use". */
export function normToken(text: string): string {
  const t = text
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '');
  if (t.length > 4 && t.endsWith('ing')) return t.slice(0, -3);
  if (t.length > 3 && t.endsWith('ed')) return t.slice(0, -1);
  if (t.length > 3 && t.endsWith('s') && !t.endsWith('ss')) return t.slice(0, -1);
  return t;
}

/** Splits words into phrases at sentence ends and long gaps. */
export function phrasesOf(words: readonly Word[]): Phrase[] {
  const out: Phrase[] = [];
  let from = 0;
  for (let i = 0; i < words.length; i++) {
    const w = words[i]!;
    const next = words[i + 1];
    const ends =
      !next || /[.?!…]["')\]]?$/.test(w.text.trim()) || next.startMs - w.endMs >= PHRASE_GAP_MS;
    if (!ends) continue;
    const span = words.slice(from, i + 1);
    const tokens = span.map((x) => normToken(x.text)).filter((t) => t.length > 0);
    if (tokens.length > 0) {
      out.push({ from, to: i, tokens, startMs: words[from]!.startMs, endMs: w.endMs });
    }
    from = i + 1;
  }
  return out;
}

function lcs(a: readonly string[], b: readonly string[]): number {
  const dp = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    let prev = 0;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j]!;
      dp[j] = a[i - 1] === b[j - 1] ? prev + 1 : Math.max(dp[j]!, dp[j - 1]!);
      prev = tmp;
    }
  }
  return dp[b.length]!;
}

/** Share of the longer phrase that the two phrases have in common, in order (0..1). */
export function similarity(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  return lcs(a, b) / Math.max(a.length, b.length);
}

const COUNTING =
  /^(\d+|one|two|three|four|five|six|seven|eight|nine|ten|first|second|third|fourth|fifth|next|then|last|final|finally|also|another)$/;

/**
 * Two lines of a list ("Step one, open the app" / "Step two, open the app") look alike but are
 * not retakes: same length, words swapped in place, and a swap involves a counting word.
 */
function isParallelLine(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  let swaps = 0;
  for (let k = 0; k < a.length; k++) {
    if (a[k] === b[k]) continue;
    swaps++;
    if (COUNTING.test(a[k]!) || COUNTING.test(b[k]!)) return true;
  }
  return swaps > 0 && swaps / a.length > 0.25;
}

const NEGATION =
  /^(not|no|never|none|nothing|nobody|without|cannot|dont|doesnt|didnt|isnt|arent|wasnt|werent|cant|couldnt|wont|wouldnt|shouldnt|havent|hasnt|hadnt|aint)$/;

/**
 * Whether `a` and `b` are two takes of one line rather than two different lines that share
 * words. A take that only adds or drops words (a fuller retake, a truncated one) needs 60 % in
 * common. When both sides have words the other lacks, the lines are swapped in place, so it needs
 * 75 %, and a negation on one side only ("You don't have a motivation problem. You have a
 * follow-through problem.") makes them a contrast, never a retake. A refrain ("this is your
 * thought of the day" / "this was your thought of the day") stays under the stricter bar.
 */
export function isRetakePair(a: readonly string[], b: readonly string[]): boolean {
  if (Math.min(a.length, b.length) < 3) return false;
  const sim = similarity(a, b);
  if (sim < 0.6 || isParallelLine(a, b)) return false;
  const onlyA = a.filter((t) => !b.includes(t));
  const onlyB = b.filter((t) => !a.includes(t));
  const negA = onlyA.some((t) => NEGATION.test(t));
  const negB = onlyB.some((t) => NEGATION.test(t));
  const contentA = onlyA.filter((t) => !NEGATION.test(t));
  const contentB = onlyB.filter((t) => !NEGATION.test(t));
  // A negation plus a swapped word on each side is a contrast; a negation that is only added
  // ("is a good idea" → "is not a good idea") is a corrected take.
  if (negA !== negB && contentA.length > 0 && contentB.length > 0) return false;
  if (onlyA.length > 0 && onlyB.length > 0) return sim >= 0.75;
  return true;
}

/** `a` is an abandoned start of `b`: it matches b's opening words and is clearly shorter. */
function isFalseStart(a: readonly string[], b: readonly string[]): boolean {
  if (a.length === 0 || a.length >= b.length) return false;
  if (a.length === 1) return false;
  const head = b.slice(0, a.length + 1);
  // Allow the very last word of the abandoned start to be cut off ("I use Mid-").
  let same = 0;
  for (let k = 0; k < a.length; k++) if (a[k] === head[k]) same++;
  return same >= Math.max(2, a.length - 1) && lcs(a, head) >= a.length - 1;
}

const ASIDE =
  /\b(let me (start|try|do|say) (that|this|it)? ?(again|over|one more time)|one more time|take (two|2|three|3)|scratch that|start (over|again)|from the top|sorry,? (let me|i)|i messed (that|it) up|wait,? (let me|no)|cut (that|this)|do (that|it) again)\b/i;

/**
 * Word ranges to cut as retakes (spec 28 R2.1–R2.4). Each phrase is compared with the next few
 * phrases (within 30 s):
 * - a near-repeat (`isRetakePair`) means the earlier one is a botched take,
 * - an abandoned opening of the next phrase is a false start,
 * - a short phrase between two takes of one line goes with the botched take,
 * - an aside to the camera ("let me do that again") is cut.
 * Inside a phrase, a restart ("I use, I use Notion") drops the first attempt.
 */
export function findRetakes(words: readonly Word[]): WordCut[] {
  const phrases = phrasesOf(words);
  const cut = new Map<number, WordCut>();
  const add = (p: Phrase, kind: RetakeKind, reason: string) => {
    if (!cut.has(p.from)) cut.set(p.from, { from: p.from, to: p.to, kind, reason });
  };

  for (let i = 0; i < phrases.length; i++) {
    const a = phrases[i]!;
    const text = words
      .slice(a.from, a.to + 1)
      .map((w) => w.text)
      .join(' ');
    if (a.tokens.length <= 9 && ASIDE.test(text)) {
      add(a, 'ramble', `Aside to camera: “${clip(text)}”`);
      continue;
    }
    for (let j = i + 1; j < Math.min(phrases.length, i + 4); j++) {
      const b = phrases[j]!;
      if (b.startMs - a.endMs > RETAKE_WINDOW_MS) break;
      const repeat = isRetakePair(a.tokens, b.tokens);
      const falseStart = j === i + 1 && isFalseStart(a.tokens, b.tokens);
      if (!repeat && !falseStart) continue;
      add(
        a,
        'retake',
        repeat
          ? `Repeated take: “${clip(text)}” (kept the later take)`
          : `False start: “${clip(text)}”`,
      );
      // Whatever sat between two takes of the same line (a stumble, "uh, no") goes too.
      for (let k = i + 1; k < j; k++) {
        const mid = phrases[k]!;
        if (mid.tokens.length <= 5) add(mid, 'retake', 'Stumble between takes');
      }
      break;
    }
  }

  // Restarts inside one phrase: the same 2–4 words said twice in a row.
  for (const p of phrases) {
    if (cut.has(p.from)) continue;
    const toks = words.slice(p.from, p.to + 1).map((w) => normToken(w.text));
    for (let n = 4; n >= 2; n--) {
      for (let s = 0; s + 2 * n <= toks.length; s++) {
        const first = toks.slice(s, s + n);
        const second = toks.slice(s + n, s + 2 * n);
        if (first.every((t, k) => t.length > 0 && t === second[k])) {
          const from = p.from + s;
          cut.set(from, {
            from,
            to: from + n - 1,
            kind: 'retake',
            reason: `Restart: “${clip(
              words
                .slice(from, from + n)
                .map((w) => w.text)
                .join(' '),
            )}”`,
          });
          s += 2 * n - 1;
        }
      }
    }
  }
  return [...cut.values()].sort((x, y) => x.from - y.from);
}

const clip = (s: string) => (s.length > 60 ? `${s.slice(0, 57)}…` : s);

/** The phrase list the cloud editor reviews: [id, text, already cut by the rules]. */
export function reviewPhrases(
  words: readonly Word[],
  phrases: readonly Phrase[],
  rule: readonly WordCut[],
): [number, string, boolean][] {
  return phrases.map((p, id) => [
    id,
    words
      .slice(p.from, p.to + 1)
      .map((w) => w.text)
      .join(' ')
      .slice(0, 600),
    rule.some((c) => c.from <= p.from && c.to >= p.to),
  ]);
}

export interface EditReview {
  cut: { phrase: number; kind: RetakeKind; reason: string }[];
  keep: number[];
}

/**
 * Folds the cloud editor's review into the rule-based retakes (spec 28 R3.2), with limits in
 * code: it may keep phrases the rules cut, and add whole-phrase cuts only while everything it
 * adds stays under `maxAddShare` of the speech (a runaway answer is ignored, the rules stand).
 */
export function applyReview(
  words: readonly Word[],
  phrases: readonly Phrase[],
  rule: readonly WordCut[],
  review: EditReview | null,
  maxAddShare = 0.3,
): WordCut[] {
  if (!review) return [...rule];
  // A full line said again almost word for word is a retake, whatever the review says.
  const repeatOfLater = (id: number) => {
    const p = phrases[id]!;
    return (
      p.tokens.length >= 5 &&
      phrases.some(
        (q, j) =>
          j > id &&
          q.startMs - p.endMs <= RETAKE_WINDOW_MS &&
          similarity(p.tokens, q.tokens) >= 0.85,
      )
    );
  };
  const keep = new Set(review.keep.filter((id) => phrases[id] && !repeatOfLater(id)));
  const kept = rule.filter((c) => {
    const id = phrases.findIndex((p) => p.from === c.from && p.to === c.to);
    return id < 0 || !keep.has(id);
  });
  const spokenMs = words.reduce((s, w) => s + (w.endMs - w.startMs), 0);
  const added: WordCut[] = [];
  let addedMs = 0;
  for (const c of review.cut) {
    const p = phrases[c.phrase];
    if (!p || keep.has(c.phrase)) continue;
    if (kept.some((k) => k.from <= p.from && k.to >= p.to)) continue;
    added.push({
      from: p.from,
      to: p.to,
      kind: c.kind,
      reason: `Editor: ${c.reason.slice(0, 100)}`,
    });
    addedMs += p.endMs - p.startMs;
  }
  if (spokenMs > 0 && addedMs > maxAddShare * spokenMs) return kept;
  // A whole-phrase cut replaces any partial (restart) cut inside it.
  const out = kept.filter((k) => !added.some((a) => a.from <= k.from && a.to >= k.to));
  return [...out, ...added].sort((a, b) => a.from - b.from);
}
