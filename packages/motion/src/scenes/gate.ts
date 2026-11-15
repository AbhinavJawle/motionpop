import {
  ENERGY_INTERVAL_MS,
  FORMATS,
  gateReportText,
  type Energy,
  type GateReport,
  type GateRule,
  type Look,
  type StylePack,
} from '@motionpop/schemas';
import type { z } from 'zod';
import type { Format } from '../contract';
import type { SlotWordTime } from '../engine/beats';
import type { Scene, SceneScore } from './define';

/**
 * Quality gates for one slot (spec 07 R9.2). The slot is built off-screen in its real format
 * and look, and every problem comes back as a report a small model can act on: which actor,
 * which rule, by how much, and a hint written by code from the numbers.
 */
export interface GateOptions {
  slot?: string;
  format: Format;
  style: StylePack | Look;
  look?: Look;
  durationMs: number;
  words?: readonly SlotWordTime[];
  stress?: readonly number[];
  pauses?: readonly { startMs: number; endMs: number }[];
  energy?: Energy;
  seed?: number;
  /** Defaults to the global `document`. */
  doc?: Document;
}

/** Rules the model can fix by changing the score. Budget and overlap are the engine's job. */
export const REPAIRABLE: readonly GateRule[] = [
  'content-invalid',
  'unknown-id',
  'anchor-out-of-range',
  'text-overflow',
  'text-truncated',
  'cue-dropped',
  'read-time',
];
export const repairable = (r: GateReport) => REPAIRABLE.includes(r.rule);

const clip = (s: string) => (s.length > 200 ? `${s.slice(0, 197)}…` : s);
const wordsIn = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const ID_FIELDS = new Set(['variant', 'beats', 'images']);

export function gateSlot<C>(scene: Scene<C>, score: unknown, o: GateOptions): GateReport[] {
  const slot = o.slot ?? 'slot';
  const out: GateReport[] = [];
  const report = (actor: string, rule: GateRule, measured: number, limit: number, hint: string) =>
    out.push({ slot, actor: actor || 'scene', rule, measured, limit, hint: clip(hint) });

  // 1. Schema: nothing else can be checked on a score that doesn't parse.
  const parsed = scene.params.safeParse(score);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const path = issue.path.map(String);
      const top = path[0] ?? '';
      const actor = top === 'content' ? (path[1] ?? 'content') : top;
      const isId = ID_FIELDS.has(top) && issue.code === 'invalid_value';
      const limit = 'maximum' in issue ? Number(issue.maximum) : 0;
      report(
        actor,
        isId ? 'unknown-id' : 'content-invalid',
        0,
        Number.isFinite(limit) ? limit : 0,
        `${path.join('.') || 'score'}: ${issue.message}`,
      );
    }
    return out;
  }
  const s = parsed.data as SceneScore<C>;

  // 2. Anchors must name a word of this slot.
  const n = o.words?.length;
  if (n !== undefined) {
    for (const b of s.beats) {
      if (b.word >= n) {
        report(
          b.cue,
          'anchor-out-of-range',
          b.word,
          n - 1,
          `beat "${b.cue}" names word ${b.word} but this slot has words 0–${n - 1}`,
        );
      }
    }
    if (out.length) return out;
  }

  // 3. Build it off-screen and read what the stage reports.
  const doc = o.doc ?? document;
  const { width, height } = FORMATS[o.format];
  const host = doc.createElement('div');
  host.style.cssText = `position:fixed;left:-100000px;top:0;width:${width}px;height:${height}px;overflow:hidden;visibility:hidden;pointer-events:none;`;
  const root = doc.createElement('div');
  host.append(root);
  doc.body.append(host);
  const warnings: string[] = [];
  try {
    const comp = scene.build(
      {
        root,
        width,
        height,
        format: o.format,
        style: o.style,
        ...(o.look ? { look: o.look } : {}),
        durationMs: o.durationMs,
        keyMomentMs: scene.keyMomentMs(s, o.durationMs),
        fps: 30,
        seed: o.seed ?? 1,
        warn: (m) => warnings.push(m),
        ...(o.words ? { words: o.words } : {}),
        ...(o.stress ? { stress: o.stress } : {}),
        ...(o.pauses ? { pauses: o.pauses } : {}),
        ...(o.energy ? { energy: o.energy } : {}),
      },
      s,
    );
    const textOf = (id: string) => root.querySelector(`[data-actor="${id}"]`)?.textContent ?? '';
    for (const w of warnings) {
      const m = /^(\S+) (truncated to fit|overflows its box)/.exec(w);
      if (!m) continue;
      const id = m[1] as string;
      const words = wordsIn(textOf(id));
      const limit = Math.max(1, Math.floor(words * 0.7));
      const cut = m[2] === 'truncated to fit';
      report(
        id,
        cut ? 'text-truncated' : 'text-overflow',
        words,
        limit,
        `${id} is too long for ${o.format}${cut ? ' and was cut off' : ''}; shorten it to ${limit} word${limit === 1 ? '' : 's'} or fewer`,
      );
    }
    const { plan, juice, energy, cast } = comp.report;
    const secs = (o.durationMs / 1000).toFixed(1);
    // Shorter than ideal, dropping an optional cue is the designed fallback (R5.2, the same
    // rule as motion:check); from the ideal length up it means the text is too long.
    for (const cue of o.durationMs >= scene.durationMs.ideal ? plan.dropped : []) {
      if (!cast[cue]?.length) continue;
      report(
        cue,
        'cue-dropped',
        o.durationMs,
        0,
        `${cue} doesn't fit in ${secs} s; shorten the text before it, land its beat earlier, or leave ${cue} out`,
      );
    }
    for (const cue of plan.squeezed) {
      report(
        cue,
        'read-time',
        o.durationMs,
        0,
        `${cue} lands too late to be read in ${secs} s; give its beat an earlier word or shorten it`,
      );
    }
    if (!juice.budgetOk) {
      report(
        'scene',
        'budget',
        juice.maxGapMs,
        ENERGY_INTERVAL_MS[energy],
        `the slot goes ${juice.maxGapMs} ms without a new beat (max ${ENERGY_INTERVAL_MS[energy]} ms at ${energy})`,
      );
    }
    // Overlap: visible text once everything has landed.
    comp.seek(Math.max(0, plan.exitStartMs - 1));
    const boxes = Array.from(root.querySelectorAll<HTMLElement>('[data-text]'))
      .filter((el) => el.style.display !== 'none')
      .map((el) => ({ id: el.dataset.actor ?? 'text', r: el.getBoundingClientRect() }))
      .filter((b) => b.r.width > 0 && b.r.height > 0);
    boxes.forEach((a, i) => {
      for (const b of boxes.slice(i + 1)) {
        const x = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
        const y = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        if (x > 1 && y > 1)
          report(
            a.id,
            'overlap',
            Math.round(y),
            0,
            `${a.id} overlaps ${b.id} by ${Math.round(y)} px`,
          );
      }
    });
    comp.dispose();
  } catch (err) {
    report('scene', 'content-invalid', 0, 0, `the scene could not be built: ${String(err)}`);
  } finally {
    host.remove();
  }
  return out;
}

/** The repair message for a fill: repairable reports only, or null when the slot passes. */
export function gateRepairText(reports: readonly GateReport[]): string | null {
  const fix = reports.filter(repairable);
  return fix.length ? gateReportText(fix) : null;
}

/** Drop the optional content fields one by one, keeping only what the schema still accepts. */
function minimal<C>(schema: z.ZodType<C>, content: C): C {
  const out = { ...(content as Record<string, unknown>) };
  for (const key of Object.keys(out)) {
    const rest = { ...out };
    delete rest[key];
    if (schema.safeParse(rest).success) delete out[key];
  }
  return out as C;
}

/** Every text field cut to its first `n` words (where the schema still accepts it). */
function shorten<C>(schema: z.ZodType<C>, content: C, n: number): C {
  const out = { ...(content as Record<string, unknown>) };
  for (const [key, v] of Object.entries(out)) {
    if (typeof v !== 'string') continue;
    const cut = v.trim().split(/\s+/).slice(0, n).join(' ');
    const next = { ...out, [key]: cut };
    if (cut && schema.safeParse(next).success) out[key] = cut;
  }
  return out as C;
}

/**
 * The scene's safe default (spec 07 R1.4): content from the slot's own words when the scene
 * can read it, its safest variant, no images, no beats (the focal cue lands on the nearest
 * word). Tries the content from the words, then the scene defaults, each full then minimal,
 * then the minimal defaults cut to 2 and 1 words, and returns the first that passes the
 * repairable gates. The last one passes by construction (tested for every scene, format and
 * duration in range).
 */
export function safeScore<C>(
  scene: Scene<C>,
  words: readonly string[],
  o: GateOptions,
): SceneScore<C> {
  const fromWords = scene.safe?.(words) ?? null;
  const small = minimal(scene.content, scene.defaultContent);
  const candidates: C[] = [
    ...(fromWords ? [fromWords, minimal(scene.content, fromWords)] : []),
    scene.defaultContent,
    small,
    shorten(scene.content, small, 2),
    shorten(scene.content, small, 1),
  ];
  return firstPassing(scene, candidates, o) ?? safeOf(scene, candidates.at(-1) as C);
}

/**
 * The safe default from the slot's own words only (spec 07 task 27): what the app shows when no
 * model could fill a slot. The same ladder as `safeScore` without the scene's example content,
 * so a viewer never sees a number or a line the narrator didn't say. `beats` (the detector's
 * anchors) are kept when given. Null when the words give no content that passes the gates.
 */
export function safeScoreFromWords<C>(
  scene: Scene<C>,
  words: readonly string[],
  o: GateOptions,
  beats: SceneScore<C>['beats'] = [],
): SceneScore<C> | null {
  const fromWords = scene.safe?.(words) ?? null;
  if (!fromWords) return null;
  const small = minimal(scene.content, fromWords);
  return firstPassing(
    scene,
    [fromWords, small, shorten(scene.content, small, 2), shorten(scene.content, small, 1)],
    o,
    beats,
  );
}

const safeOf = <C>(scene: Scene<C>, content: C, beats: SceneScore<C>['beats'] = []) => {
  const variant = scene.variants[0]?.id;
  return { ...(variant ? { variant } : {}), content, beats, images: [] } as SceneScore<C>;
};

/** The first content (safest variant, no images) that passes the repairable gates. */
function firstPassing<C>(
  scene: Scene<C>,
  contents: readonly C[],
  o: GateOptions,
  beats: SceneScore<C>['beats'] = [],
): SceneScore<C> | null {
  for (const c of contents) {
    const score = safeOf(scene, c, beats);
    if (!gateSlot(scene, score, o).some(repairable)) return score;
  }
  return null;
}
