import { tagSpans, type SlotWord, type TaggedSpan } from '@motionpop/ai';

/**
 * Loose drafts (founder, 2026-11-16: "a lot of slot types are saying Couldn't switch to that
 * one"). When the creator picks a graphic type for a slot, the scene's own drafter only fills it
 * from strong signals (a "versus", three years, a spoken list). These drafts fill it from any
 * words, so an explicit choice always works, and still never invent what wasn't said: a stat or
 * a chart needs numbers in the words, and a map needs a place (the scene's drafter finds those).
 * The result goes through the scene's gate like any other draft.
 */

const STOP = new Set(
  (
    'a an the to of for in on at by with and or but so than this that these those it its it’s ' +
    'i you we they he she is are was were be been do does did should would could can will just ' +
    "it's that's there's here's what's very really also then now well um uh like our my your " +
    'their his her them us me not no yes if as from into about over after before up down out'
  ).split(' '),
);
const bare = (w: string) => w.replace(/^[^\p{L}\p{N}$€£]+|[^\p{L}\p{N}%]+$/gu, '');
const title = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);
const contentWords = (ws: readonly string[]) =>
  ws.map(bare).filter((w) => w && !STOP.has(w.toLowerCase()));

/** At most `n` words of a piece, grammar trimmed from both ends, capped at `chars`. */
function phrase(ws: readonly string[], n: number, chars: number): string {
  const kept = ws.map(bare).filter(Boolean);
  while (kept.length && STOP.has(kept[0]!.toLowerCase())) kept.shift();
  while (kept.length && STOP.has(kept[kept.length - 1]!.toLowerCase())) kept.pop();
  let out = kept.slice(0, n);
  while (out.length > 1 && out.join(' ').length > chars) out = out.slice(0, -1);
  const s = out.join(' ');
  return s.length <= chars ? title(s) : title(s.slice(0, chars).trim());
}

/** The words cut into pieces at sentence ends, commas and joining words. */
function pieces(ws: readonly string[]): string[][] {
  const out: string[][] = [[]];
  for (const w of ws) {
    const low = bare(w).toLowerCase();
    if (['and', 'but', 'then', 'or', 'so'].includes(low) && out[out.length - 1]!.length > 0) {
      out.push([]);
      continue;
    }
    out[out.length - 1]!.push(w);
    if (/[.,;:!?…]$/.test(w)) out.push([]);
  }
  return out.filter((p) => contentWords(p).length > 0);
}

/** Exactly `n` pieces: real pieces when there are enough, else the words cut evenly. */
function nPieces(ws: readonly string[], min: number, max: number): string[][] | null {
  const real = pieces(ws);
  if (real.length >= min) return real.slice(0, max);
  const words = ws.filter((w) => bare(w));
  if (contentWords(words).length < min) return null;
  const size = Math.ceil(words.length / min);
  const even: string[][] = [];
  for (let i = 0; i < words.length; i += size) even.push(words.slice(i, i + size));
  return even.filter((p) => contentWords(p).length > 0).length >= min ? even : null;
}

function spansOf(ws: readonly string[]): TaggedSpan[] {
  const words: SlotWord[] = ws.map((text, i) => ({
    text,
    startMs: i * 400,
    endMs: i * 400 + 300,
    filler: false,
  }));
  return tagSpans(words);
}

function numberParts(s: TaggedSpan): { prefix?: string; suffix?: string } {
  if (s.unit === '$' || s.unit === '£' || s.unit === '€') return { prefix: s.unit };
  if (s.unit === '%') return { suffix: '%' };
  if (s.unit === 'x') return { suffix: '×' };
  return {};
}

const decimalsOf = (v: number) =>
  Number.isInteger(v) ? 0 : Math.min(2, `${v}`.split('.')[1]!.length);

type Draft = Record<string, unknown>;

const DRAFTERS: Record<string, (ws: readonly string[]) => Draft | null> = {
  'stat-punch': (ws) => {
    const n = spansOf(ws).find((s) => s.kind === 'number' && s.value !== undefined);
    if (!n || n.value === undefined) return null;
    const around = [...ws.slice(0, n.wordStart), ...ws.slice(n.wordEnd + 1)];
    return {
      value: n.value,
      ...numberParts(n),
      decimals: decimalsOf(n.value),
      label: phrase(around, 6, 48) || 'As said',
    };
  },
  'chart-story': (ws) => {
    const nums = spansOf(ws).filter((s) => s.kind === 'number' && s.value !== undefined);
    if (nums.length < 2) return null;
    const picked = nums.slice(0, 6);
    const labels = picked.map((s, i) => {
      const before = ws.slice(Math.max(0, s.wordStart - 3), s.wordStart);
      return phrase(before, 3, 16) || `#${i + 1}`;
    });
    const unit = numberParts(picked[0]!);
    return {
      labels,
      values: picked.map((s) => Math.min(999_999, Math.max(0, s.value ?? 0))),
      decimals: Math.max(...picked.map((s) => decimalsOf(s.value ?? 0))),
      ...unit,
    };
  },
  versus: (ws) => {
    const split = ws.findIndex((w) =>
      ['vs', 'versus', 'against', 'than', 'but', 'or', 'while', 'whereas'].includes(
        bare(w).toLowerCase(),
      ),
    );
    const cut = split > 0 && split < ws.length - 1 ? split : Math.floor(ws.length / 2);
    const leftWords = ws.slice(0, cut);
    const rightWords = ws.slice(split > 0 && split < ws.length - 1 ? cut + 1 : cut);
    const name = (part: readonly string[]) => {
      const c = contentWords(part).sort((a, b) => b.length - a.length);
      return phrase(c.slice(0, 2), 2, 24);
    };
    const left = name(leftWords);
    const right = name(rightWords);
    if (!left || !right || left.toLowerCase() === right.toLowerCase()) return null;
    return {
      left,
      right,
      leftDetail: phrase(leftWords, 6, 40) || undefined,
      rightDetail: phrase(rightWords, 6, 40) || undefined,
    };
  },
  'list-stack': (ws) => {
    const ps = nPieces(ws, 3, 5);
    if (!ps) return null;
    const items = ps.map((p) => phrase(p, 6, 40)).filter(Boolean);
    return items.length >= 3 ? { items: items.slice(0, 5) } : null;
  },
  timeline: (ws) => {
    const spans = spansOf(ws);
    const years = spans.filter((s) => s.kind === 'year');
    const ps = nPieces(ws, 3, 6);
    if (!ps) return null;
    const steps = ['First', 'Then', 'Next', 'After', 'Later', 'Now'];
    const dates =
      years.length >= ps.length
        ? years.slice(0, ps.length).map((y) => bare(y.text))
        : ps.map((_, i) => (i === ps.length - 1 ? 'Now' : (steps[i] ?? `Step ${i + 1}`)));
    const events = ps.map((p) => phrase(p, 6, 48)).filter(Boolean);
    if (events.length !== dates.length) return null;
    return { dates, events };
  },
};

/** A loose draft of the scene's `content` from any words, or null when it would need inventing. */
export function looseContent(componentId: string, words: readonly string[]): Draft | null {
  const make = DRAFTERS[componentId];
  if (!make) return null;
  const d = make(words.filter((w) => bare(w)));
  if (!d) return null;
  // Optional fields left undefined are dropped, so the schema sees them as absent.
  return Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined && v !== ''));
}

/** Why a picked type can't be drafted from these words (for the message), when it can't. */
export function looseReason(componentId: string): string {
  if (componentId === 'stat-punch' || componentId === 'chart-story')
    return componentId === 'chart-story'
      ? 'A chart needs at least two numbers in these words.'
      : 'There’s no number in these words to show.';
  if (componentId === 'map-zoom') return 'These words don’t name a place to show.';
  return 'Couldn’t switch to that one. Try Generate with a prompt.';
}
