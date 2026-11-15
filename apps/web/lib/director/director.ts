import type { DirectPlanInput, EnforcedPlan, PlannedVideo, TaggedSpan } from '@motionpop/ai';
import type { Energy, Look, Slot, SlotSuggestion, StylePack, Transcript } from '@motionpop/schemas';
import { sceneFor } from '../motion/registry';

/** The director's request for one video: the plan input and which slots it covers. */
export interface DirectorRequest {
  input: Omit<DirectPlanInput, 'route'>;
  /** `input.slots[k]` is `slots[indices[k]]`: only scene slots are planned. */
  indices: number[];
  /** Stable per voiceover, for the enforcer's variant rotation. */
  seed: number;
}

const ABOUT_MAX = 200;
const WORDS_MAX = 240;

/** FNV-1a over the words: the same voiceover always gets the same rotation. */
function seedOf(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/** The detector's score for a placed slot (the post-pass keeps reason and component). */
function scoreOf(slot: Slot, suggestions: readonly SlotSuggestion[]): number {
  const s = suggestions.find((x) => x.reason === slot.reason && x.componentId === slot.componentId);
  return Math.min(1, Math.max(0, s?.score ?? 0.5));
}

/** The look's motifs: the marks it can bring back (a plain style pack has none). */
function motifsOf(style: StylePack | Look): string[] {
  const marks = (style as Look).marks;
  return marks ? [...new Set(Object.values(marks).filter((m) => m !== undefined))].slice(0, 6) : [];
}

/**
 * The `direct.plan` input for a processed voiceover (spec 07 R6.1): one compact line per scene
 * slot (its spoken words, what the tagger found, its scene and its most stressed word), the
 * scenes with their variants, the look's motifs and the image cap. Pure.
 */
export function directorRequest(o: {
  slots: readonly Slot[];
  suggestions: readonly SlotSuggestion[];
  transcript: Pick<Transcript, 'words' | 'prosody'>;
  spans: readonly TaggedSpan[];
  style: StylePack | Look;
  energy: Energy;
  imagesMax: number;
}): DirectorRequest | null {
  const indices = o.slots.flatMap((s, i) => (sceneFor(s.componentId) ? [i] : []));
  if (indices.length === 0) return null;
  const words = o.transcript.words;
  const stress = o.transcript.prosody?.stress;
  const sceneIds = [...new Set(indices.map((i) => (o.slots[i] as Slot).componentId))];
  return {
    indices,
    seed: seedOf(words.map((w) => w.text).join(' ')),
    input: {
      energy: o.energy,
      slots: indices.map((i) => {
        const s = o.slots[i] as Slot;
        const said = words
          .slice(s.wordStart, s.wordEnd + 1)
          .map((w) => w.text)
          .join(' ');
        const kinds = [
          ...new Set(
            o.spans
              .filter((sp) => sp.wordStart <= s.wordEnd && sp.wordEnd >= s.wordStart)
              .map((sp) => sp.kind),
          ),
        ];
        const peakStress = stress ? Math.max(50, ...stress.slice(s.wordStart, s.wordEnd + 1)) : 50;
        return {
          words: said.slice(0, WORDS_MAX),
          kinds,
          candidates: [s.componentId],
          stress: Math.min(100, Math.round(peakStress)),
          score: scoreOf(s, o.suggestions),
        };
      }),
      scenes: sceneIds.map((id) => {
        const scene = sceneFor(id)!;
        return {
          id,
          about: scene.useWhen.slice(0, ABOUT_MAX),
          variants: scene.variants.map((v) => ({ id: v.id, about: v.about.slice(0, 160) })),
          strongest: scene.peakVariant,
          imageRole: scene.imageRoles.length > 0,
        };
      }),
      motifs: motifsOf(o.style),
      imagesMax: Math.max(0, Math.min(20, Math.floor(o.imagesMax))),
    },
  };
}

/**
 * The plan applied to the slots: each planned scene slot gets its variant (in its score) and its
 * energy. Scenes don't change yet: each slot has one candidate until detection drafts more.
 * Images and motifs are kept by the caller for the steps that use them (tasks 25, 26, 31).
 */
export function applyPlan(
  slots: readonly Slot[],
  indices: readonly number[],
  plan: EnforcedPlan,
): Slot[] {
  const out = slots.map((s) => ({ ...s }));
  indices.forEach((i, k) => {
    const p = plan.slots[k];
    const s = out[i];
    if (!p || !s || p.sceneId !== s.componentId) return;
    s.params = p.variant ? { ...s.params, variant: p.variant } : s.params;
    s.energy = p.energy;
  });
  return out;
}

/** What the Processing card says about the plan (spec 07 design, AI flow 2). */
export function planSummary(r: Pick<PlannedVideo, 'source' | 'why'>, peakAtMs?: number): string {
  const peak = peakAtMs === undefined ? '' : ` · peak at ${(peakAtMs / 1000).toFixed(1)}s`;
  if (r.source === 'device') return `Planned on your device${peak}`;
  if (r.source === 'cloud') return `Planned in the cloud · free${peak}`;
  return r.why === 'limit'
    ? 'Planned with built-in rules (daily limit reached)'
    : `Planned with built-in rules${peak}`;
}
