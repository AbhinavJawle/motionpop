import type { SceneScore } from './define';

/** What the tagger found in the slot (mirrors the tagger's span kinds, plus plain statements). */
export type ExemplarKind =
  'number' | 'year' | 'place' | 'name' | 'comparison' | 'list' | 'statement';

/**
 * A hand-approved example fill (spec 07 R9.3): the slot's spoken words as the transcript gives
 * them, and the score a good director would write. Beats index into `text` split on spaces.
 */
export interface Exemplar<C> {
  id: string;
  kind: ExemplarKind;
  text: string;
  score: SceneScore<C>;
}

export interface ExemplarQuery {
  kind?: ExemplarKind | undefined;
  wordCount: number;
  withImages?: boolean;
}

/**
 * The closest examples for a slot, by plain code (no embeddings): same span kind first, then
 * nearest word count, then image use; never two of the same variant. Deterministic.
 */
export function pickExemplars<C>(
  list: readonly Exemplar<C>[],
  q: ExemplarQuery,
  n = 2,
): Exemplar<C>[] {
  const cost = (e: Exemplar<C>) =>
    (q.kind && e.kind !== q.kind ? 100 : 0) +
    Math.abs(e.text.split(' ').length - q.wordCount) +
    (e.score.images.length > 0 !== Boolean(q.withImages) ? 50 : 0);
  const ranked = [...list].sort((a, b) => cost(a) - cost(b) || a.id.localeCompare(b.id));
  const out: Exemplar<C>[] = [];
  const variants = new Set<string | undefined>();
  for (const e of ranked) {
    if (out.length === n) break;
    if (variants.has(e.score.variant)) continue;
    variants.add(e.score.variant);
    out.push(e);
  }
  return out;
}

/** One example as a compact input → output pair for the fill prompt. */
export function exemplarText<C>(e: Exemplar<C>): string {
  const words = e.text
    .split(' ')
    .map((w, i) => `${i}:${w}`)
    .join(' ');
  const { variant, content, beats, images } = e.score;
  return `${words} → ${JSON.stringify({ variant, content, beats, ...(images.length ? { images } : {}) })}`;
}

/** Synthetic word timings for an example (about 3 words a second), for gates and checks. */
export function exemplarWords(text: string): { startMs: number; endMs: number }[] {
  return text.split(' ').map((_, i) => ({ startMs: 150 + i * 320, endMs: 400 + i * 320 }));
}
