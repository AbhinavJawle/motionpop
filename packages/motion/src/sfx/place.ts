import { audioOf, type AudioSetting, type Energy, type SlotStatus } from '@motionpop/schemas';
import { hashString } from '../core/rng';
import { componentFor } from '../registry';
import { SFX_TAKES, type SfxKind } from './synth';

/**
 * Automatic sound effects on the graphics (spec 12 design §5, R6.2–R6.5). Pure: derived from the
 * slots, the transcript and a seed, never stored, so retiming a slot moves its sounds for free.
 */

/** No two effects closer than this; the lower-priority one is dropped (R6.2). */
export const SFX_MIN_GAP_MS = 1200;
/** An effect's peak lands one frame after its picture moment (R6.3). */
export const SFX_FRAME_LAG_MS = 33;
export const SFX_TICKS_PER_SLOT = 4;
export const SFX_TICK_GAIN_DB = -6;

/** Number scenes and components: a pop on the focal landing. */
const NUMBER_IDS = new Set(['stat-punch', 'bar-chart', 'big-number', 'line-chart']);
/** Word-by-word text scenes: ticks on the words. */
const WORD_BY_WORD_IDS = new Set(['hook-statement']);
/** Categories whose graphics enter with a large move: a whoosh on the entrance. */
const WHOOSH_CATEGORIES = new Set(['data', 'map', 'transition']);

const PRIORITY: Record<SfxKind, number> = { impact: 4, pop: 3, whoosh: 2, tick: 1, rise: 0 };

/** One placed effect. `atMs` is where its peak lands; `gainDb` is relative to the kind's level. */
export interface SfxPlacement {
  kind: SfxKind;
  take: number;
  atMs: number;
  slotId: string;
  gainDb: number;
}

/** The slot fields placement reads (an `EditorProject` slot fits). */
export interface SfxSlot {
  id: string;
  startMs: number;
  endMs: number;
  wordStart: number;
  wordEnd: number;
  componentId: string;
  status: SlotStatus;
  energy?: Energy | undefined;
}

export interface SfxProject<S extends SfxSlot> {
  durationMs: number;
  slots: readonly S[];
  transcript: { words: ReadonlyArray<{ startMs: number; filler?: boolean | undefined }> };
  audio?: AudioSetting | undefined;
}

type Draft = Omit<SfxPlacement, 'take'>;

/**
 * Places the effects:
 * 1. per ready slot, in time order: a whoosh one frame into the slot for `data`, `map` and
 *    `transition` graphics; a pop one frame after the key moment for number graphics; ticks one
 *    frame after each word for word-by-word text scenes (at most 4 per slot, at −6 dB);
 * 2. one impact one frame after the key moment of the first `hype` slot of the director's energy
 *    curve, with a rise ending on it (the rise shares the impact's `atMs`: its peak is its end);
 * 3. impact > pop > whoosh > tick: an effect closer than 1.2 s to a kept one of higher priority is
 *    dropped (the rise rides on its impact and is not spaced);
 * 4. takes: `hash(seed, slotId, kind) mod takes`, bumped when equal to the previous same-kind take.
 * `keyMomentOf(slot)` is the slot-relative key moment in ms (the component's `keyMomentMs`).
 * Returns nothing when the project's `audio.autoSfx` is off (R6.5).
 */
export function placeSfx<S extends SfxSlot>(
  project: SfxProject<S>,
  keyMomentOf: (slot: S) => number,
  seed: number,
): SfxPlacement[] {
  if (!audioOf(project).autoSfx) return [];
  const words = project.transcript.words;
  const ready = project.slots
    .filter((s) => s.status === 'ready' && s.endMs > s.startMs)
    .slice()
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);

  const end = (s: S) => Math.min(s.endMs, project.durationMs);
  const inSlot = (s: S, ms: number) => Math.min(Math.max(Math.round(ms), s.startMs), end(s));
  const keyAt = (s: S) => {
    const k = keyMomentOf(s);
    return inSlot(s, s.startMs + (Number.isFinite(k) ? k : 0) + SFX_FRAME_LAG_MS);
  };

  const drafts: Draft[] = [];
  const peak = ready.find((s) => s.energy === 'hype');
  for (const s of ready) {
    if (s.startMs >= project.durationMs) continue;
    const category = componentFor(s.componentId)?.category;
    if (category && WHOOSH_CATEGORIES.has(category)) {
      drafts.push({
        kind: 'whoosh',
        atMs: inSlot(s, s.startMs + SFX_FRAME_LAG_MS),
        slotId: s.id,
        gainDb: 0,
      });
    }
    if (s === peak) {
      drafts.push({ kind: 'impact', atMs: keyAt(s), slotId: s.id, gainDb: 0 });
    } else if (category === 'data' || NUMBER_IDS.has(s.componentId)) {
      drafts.push({ kind: 'pop', atMs: keyAt(s), slotId: s.id, gainDb: 0 });
    }
    if (WORD_BY_WORD_IDS.has(s.componentId)) {
      let lastTick = -Infinity;
      let n = 0;
      for (let i = s.wordStart; i <= s.wordEnd && n < SFX_TICKS_PER_SLOT; i++) {
        const w = words[i];
        if (!w || w.filler) continue;
        const at = inSlot(s, w.startMs + SFX_FRAME_LAG_MS);
        if (at - lastTick < SFX_MIN_GAP_MS) continue;
        drafts.push({ kind: 'tick', atMs: at, slotId: s.id, gainDb: SFX_TICK_GAIN_DB });
        lastTick = at;
        n++;
      }
    }
  }

  // Priority pass: keep the highest-priority effects first, earliest first within a priority.
  const ranked = drafts
    .map((d, order) => ({ d, order }))
    .sort(
      (a, b) => PRIORITY[b.d.kind] - PRIORITY[a.d.kind] || a.d.atMs - b.d.atMs || a.order - b.order,
    );
  const kept: Draft[] = [];
  for (const { d } of ranked) {
    if (kept.every((k) => Math.abs(k.atMs - d.atMs) >= SFX_MIN_GAP_MS)) kept.push(d);
  }
  const impact = kept.find((k) => k.kind === 'impact');
  if (impact) kept.push({ kind: 'rise', atMs: impact.atMs, slotId: impact.slotId, gainDb: 0 });

  kept.sort((a, b) => a.atMs - b.atMs || PRIORITY[a.kind] - PRIORITY[b.kind]);
  const prev: Partial<Record<SfxKind, number>> = {};
  return kept.map((d) => {
    const n = SFX_TAKES[d.kind];
    let take = hashString(`${seed >>> 0}:${d.slotId}:${d.kind}`) % n;
    if (n > 1 && prev[d.kind] === take) take = (take + 1) % n;
    prev[d.kind] = take;
    return { ...d, take };
  });
}
