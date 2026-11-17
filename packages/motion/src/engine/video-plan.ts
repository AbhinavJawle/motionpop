/**
 * The video plan (spec 07c R3): one pass over every slot of a video, in code, before any slot is
 * built. It decides what makes the slots read as one film instead of a slide deck:
 *
 * - **Companions.** What fills a scene's open side when it has no picture: a number made
 *   physical (units, dots, icons, a ruler) or the line's subject as a stamp (`companion.ts`).
 * - **Variety.** Two neighbours never share a signature (scene + companion kind); a repeat
 *   falls back to the type-led form, so the rhythm alternates.
 * - **Sides.** Split frames alternate left and right, so consecutive graphics answer each other.
 * - **The climax.** The strongest number lands full frame (hero, no companion), entered with a
 *   pull, after a calm slot: stillness before the climax.
 * - **Stations.** Each slot has a place in one continuous world; the world camera travels from
 *   station to station at every seam (`runtime/world.ts`).
 *
 * Pure and deterministic: the same slots give the same plan in the preview, the gates and the
 * render. It reads only what every compiled slot already carries (scene id, score, words).
 */
import type { CompileSlot } from '../compiler/types';
import { companionSig, lineCompanion, numberCompanion, type Companion } from './companion';

export interface SlotStaging {
  /** Position in the video (sorted by start). */
  index: number;
  count: number;
  /** What fills the open side when the scene has no ready picture; null keeps the full frame. */
  companion: Companion | null;
  /** Which side a split frame gives the picture or companion (16:9); top otherwise. */
  side: 'left' | 'right';
  /** The strongest moment of the video. */
  climax: boolean;
  /** The slot right before the climax: held calm (stillness before the climax). */
  calm: boolean;
  /** Where this slot sits in the world, in frame widths (x) and heights (y). */
  station: { x: number; y: number };
}

export interface VideoPlan {
  slots: Map<string, SlotStaging>;
  /** Slot ids in time order. */
  order: string[];
  climaxId: string | null;
}

/** Scenes with an image role: their open side can take a companion. */
const COMPANION_SCENES = new Set([
  'stat-punch',
  'hook-statement',
  'quote',
  'list-stack',
  'photo-evidence',
]);
/** Horizontal distance between stations, in frame widths. */
export const STATION_STEP = 0.4;

interface Facts {
  id: string;
  scene: string;
  startMs: number;
  endMs: number;
  companion: Companion | null;
  /** A ready picture is in the score (it takes the open side instead). */
  picture: boolean;
  /** How strong a climax this slot would make (0 = never). */
  strength: number;
}

const textOf = (s: CompileSlot): string[] =>
  (s.words ?? []).map((w) => w.text ?? '').filter(Boolean);

function contentOf(s: CompileSlot): Record<string, unknown> {
  const p = s.params as { content?: unknown } | null;
  return p && typeof p.content === 'object' && p.content !== null
    ? (p.content as Record<string, unknown>)
    : {};
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** The words a scene shows (its line, caption, quote or items), for a stamp's subject. */
function shownWords(scene: string, c: Record<string, unknown>): string[] {
  const parts: string[] = [];
  if (scene === 'list-stack' && Array.isArray(c['items']))
    for (const it of c['items'] as unknown[])
      parts.push(typeof it === 'string' ? it : str((it as { text?: unknown })?.text));
  for (const k of ['line', 'caption', 'quote', 'title', 'label', 'headline']) parts.push(str(c[k]));
  return parts.join(' ').split(/\s+/).filter(Boolean);
}

function factsOf(s: CompileSlot, images: ReadonlySet<string> | null): Facts {
  const c = contentOf(s);
  const p = s.params as { images?: { assetId?: unknown }[] } | null;
  const picture = (p?.images ?? []).some(
    (i) => typeof i?.assetId === 'string' && (images === null || images.has(i.assetId)),
  );
  let companion: Companion | null = null;
  let strength = 0;
  if (COMPANION_SCENES.has(s.componentId)) {
    if (s.componentId === 'stat-punch' && typeof c['value'] === 'number') {
      const value = c['value'];
      // A long figure ("$1,234,567.89bn") needs the whole width; it gets no companion.
      const dec = typeof c['decimals'] === 'number' ? c['decimals'] : 0;
      const shown =
        str(c['prefix']).length +
        Math.abs(value)
          .toFixed(dec)
          .replace(/\B(?=(\d{3})+(?!\d))/g, ',').length +
        str(c['suffix']).length;
      companion =
        shown > 8
          ? null
          : numberCompanion({
              value,
              prefix: str(c['prefix']) || undefined,
              suffix: str(c['suffix']) || undefined,
              label: str(c['label']),
              spoken: textOf(s),
            });
      const suffix = str(c['suffix']);
      // Money and scaled amounts hit hardest, then percentages, then plain counts.
      const scale = /b/i.test(suffix) ? 4 : /m/i.test(suffix) ? 3 : /k/i.test(suffix) ? 2 : 1;
      strength =
        (str(c['prefix']) ? 3 : 0) +
        scale +
        (suffix === '%' ? 1.5 : 0) +
        Math.log10(1 + Math.abs(value)) * 0.4;
    } else {
      // A line's subject from what it shows first, then from what is said. A line has no number, so
      // it never takes the climax (spec 07c R3.2: the climax is the strongest number).
      companion = lineCompanion(shownWords(s.componentId, c)) ?? lineCompanion(textOf(s));
    }
  }
  return {
    id: s.id,
    scene: s.componentId,
    startMs: s.startMs,
    endMs: s.endMs,
    companion,
    picture,
    strength,
  };
}

/**
 * Plan a video's slots. `images`: ids of the pictures that are actually ready (null = trust the
 * scores). Film beats (custom slots) take part in the timeline but are never staged.
 */
export function planVideo(
  slots: readonly CompileSlot[],
  images: ReadonlySet<string> | null = null,
): VideoPlan {
  const sorted = [...slots]
    .filter((s) => s.componentId !== 'custom')
    .sort((a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id));
  const facts = sorted.map((s) => factsOf(s, images));
  const n = facts.length;

  // The climax: the strongest number; ties go to the later one (a film builds to it). Only a
  // video with something to build from (3+ slots) gets one.
  let climax = -1;
  if (n >= 3) {
    facts.forEach((f, i) => {
      if (f.strength <= 0) return;
      if (climax < 0 || f.strength >= (facts[climax] as Facts).strength) climax = i;
    });
    // Never the very first slot: a climax needs a build-up.
    if (climax === 0) climax = -1;
  }

  const out = new Map<string, SlotStaging>();
  let prevSig = '';
  let side: 'left' | 'right' = 'right';
  let y = 0;
  facts.forEach((f, i) => {
    let companion = f.picture ? null : f.companion;
    if (i === climax) companion = null;
    // Variety: the same scene with the same companion twice in a row drops to the type form.
    const sig = `${f.scene}|${f.picture ? 'picture' : companionSig(companion)}`;
    if (sig === prevSig && companion !== null) companion = null;
    const finalSig = `${f.scene}|${f.picture ? 'picture' : companionSig(companion)}`;
    prevSig = finalSig;
    const split = f.picture || companion !== null;
    if (split) side = side === 'left' ? 'right' : 'left';
    // Stations climb and dip a little, so the travel between them is never a flat line.
    y += i === 0 ? 0 : ((i * 7919) % 3) - 1 === 0 ? 0.08 : ((i * 7919) % 3) - 1 > 0 ? 0.12 : -0.12;
    out.set(f.id, {
      index: i,
      count: n,
      companion,
      side,
      climax: i === climax,
      calm: climax > 0 && i === climax - 1,
      station: { x: i * STATION_STEP, y: Math.max(-0.3, Math.min(0.3, y)) },
    });
  });
  return {
    slots: out,
    order: facts.map((f) => f.id),
    climaxId: climax >= 0 ? (facts[climax] as Facts).id : null,
  };
}
