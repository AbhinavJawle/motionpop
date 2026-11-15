import { wordsInRange, type Slot, type SlotSuggestion } from '@motionpop/schemas';
import { catalogueEntry, componentLimits } from './catalogue';
import type { SlotWord } from './types';

/** Minimum space between two suggested slots (R3.1). A suggestion rule only; users can touch slots. */
export const SUGGESTION_GAP_MS = 400;

export interface ComponentLimits {
  minMs: number;
  idealMs: number;
  maxMs: number;
}

export interface ValidatedParams {
  params: Record<string, unknown>;
  needsInput: string[];
}

export interface PostPassInput {
  words: readonly SlotWord[];
  suggestions: readonly SlotSuggestion[];
  /** Ids already used in the project; new ids never collide with them. */
  existingIds?: Iterable<string>;
  /** Duration limits per component; null drops the suggestion. Default: the catalogue. */
  limits?: (componentId: string) => ComponentLimits | null;
  /** Validates params against the component schema, filling defaults. Default: keep as-is. */
  validate?: (componentId: string, params: Record<string, unknown>) => ValidatedParams;
  /** Whether the component can render now. Default: the catalogue. */
  built?: (componentId: string) => boolean;
}

interface Placed {
  startMs: number;
  endMs: number;
  suggestion: SlotSuggestion;
  limits: ComponentLimits;
}

const defaultValidate = (_id: string, params: Record<string, unknown>): ValidatedParams => ({
  params: { ...params },
  needsInput: [],
});

const defaultBuilt = (id: string): boolean => catalogueEntry(id)?.built === true;

/** The free span around `startMs` given the placed slots, keeping the gap to each of them. */
function freeGap(
  placed: readonly Placed[],
  startMs: number,
  lo: number,
  hi: number,
): [number, number] {
  let gapLo = lo;
  let gapHi = hi;
  for (const k of placed) {
    if (k.endMs + SUGGESTION_GAP_MS <= startMs) {
      gapLo = Math.max(gapLo, k.endMs + SUGGESTION_GAP_MS);
    } else gapHi = Math.min(gapHi, k.startMs - SUGGESTION_GAP_MS);
  }
  return [gapLo, gapHi];
}

/** Widen [s, e] to `target` ms: end first, then start, inside [gapLo, gapHi]. */
function widen(
  s: number,
  e: number,
  target: number,
  gapLo: number,
  gapHi: number,
): [number, number] {
  let need = target - (e - s);
  if (need <= 0) return [s, e];
  const grow = Math.max(0, Math.min(need, gapHi - e));
  need -= grow;
  return [s - Math.max(0, Math.min(need, s - gapLo)), e + grow];
}

/**
 * Turns detector suggestions into timeline-valid slots (spec 06 R3, design.md "Post-pass").
 *
 * Word snapping: a suggestion's own range starts on word edges (first word start to last word
 * end). Widening to the component's min/ideal duration moves an edge into free space and can
 * land between words or inside one, because snapping it could break the minimum duration or the
 * 400 ms gaps. After the final range is known, `wordStart`/`wordEnd` are re-derived with
 * `wordsInRange`, so they always name exactly the words the slot overlaps.
 *
 * Pure and deterministic; never mutates its input.
 */
export function postPass(input: PostPassInput): Slot[] {
  const { words, suggestions } = input;
  const limitsOf = input.limits ?? componentLimits;
  const validate = input.validate ?? defaultValidate;
  const built = input.built ?? defaultBuilt;
  const first = words[0];
  const last = words[words.length - 1];
  if (!first || !last) return [];
  const lo = first.startMs;
  const hi = last.endMs;

  // Clamp indices and compute each candidate's own range.
  const candidates = suggestions.flatMap((suggestion, order) => {
    const limits = limitsOf(suggestion.componentId);
    if (!limits) return [];
    const ws = Math.min(Math.max(0, suggestion.wordStart), words.length - 1);
    const we = Math.min(Math.max(ws, suggestion.wordEnd), words.length - 1);
    const startMs = (words[ws] as SlotWord).startMs;
    const endMs = (words[we] as SlotWord).endMs;
    return [{ suggestion, limits, order, ws, startMs, endMs }];
  });
  candidates.sort(
    (a, b) => b.suggestion.score - a.suggestion.score || a.ws - b.ws || a.order - b.order,
  );

  const kept: Placed[] = [];
  for (const c of candidates) {
    let s = c.startMs;
    let e = c.endMs;
    if (e <= s) continue;
    // The suggestion's own range must already clear every kept slot by the gap.
    if (kept.some((k) => k.startMs < e + SUGGESTION_GAP_MS && k.endMs + SUGGESTION_GAP_MS > s)) {
      continue;
    }
    const [gapLo, gapHi] = freeGap(kept, s, lo, hi);
    if (gapHi - gapLo < c.limits.minMs) continue;
    [s, e] = widen(s, e, c.limits.minMs, gapLo, gapHi);
    if (e - s > c.limits.maxMs) e = s + c.limits.maxMs;
    kept.push({ startMs: s, endMs: e, suggestion: c.suggestion, limits: c.limits });
  }

  // Second pass, in score order: widen towards the ideal duration in the space that is left.
  // Doing this only after every slot has its minimum means a high-score slot never takes the
  // room a lower-score neighbour needed to exist at all.
  for (const k of kept) {
    const others = kept.filter((o) => o !== k);
    const [gapLo, gapHi] = freeGap(others, k.startMs, lo, hi);
    [k.startMs, k.endMs] = widen(k.startMs, k.endMs, k.limits.idealMs, gapLo, gapHi);
    if (k.endMs - k.startMs > k.limits.maxMs) k.endMs = k.startMs + k.limits.maxMs;
  }

  kept.sort((a, b) => a.startMs - b.startMs);

  const used = new Set(input.existingIds ?? []);
  let counter = 0;
  const nextId = (): string => {
    let id: string;
    do id = `s-${++counter}`;
    while (used.has(id));
    used.add(id);
    return id;
  };

  const slots: Slot[] = [];
  for (const k of kept) {
    const range = wordsInRange(words, k.startMs, k.endMs);
    if (!range) continue;
    const sg = k.suggestion;
    const v = validate(sg.componentId, sg.params);
    const needsInput = [...new Set([...(sg.needsInput ?? []), ...v.needsInput])];
    slots.push({
      id: nextId(),
      startMs: k.startMs,
      endMs: k.endMs,
      wordStart: range.wordStart,
      wordEnd: range.wordEnd,
      reason: sg.reason,
      componentId: sg.componentId,
      skillId: sg.skillId,
      prompt: '',
      params: v.params,
      status: built(sg.componentId) && needsInput.length === 0 ? 'ready' : 'suggested',
      ...(needsInput.length > 0 ? { needsInput } : {}),
      notes: [],
    });
  }
  return slots;
}
