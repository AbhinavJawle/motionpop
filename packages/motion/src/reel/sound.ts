// Reel engine (spec 26 R4): sound design as a pure function of the plan. Every visual beat gets
// its hit (a whoosh as a graphic arrives, ticks as items land, pops for logos, a rise into a
// counter, an impact on a punchline), mixed under the voice with the deterministic SFX synth, so
// the preview and the export play the same bytes.
import type { ReelPlan, ReelScene } from '@motionpop/schemas';
import {
  SFX_SAMPLE_RATE,
  SFX_TAKES,
  duckEnvelope,
  mixBed,
  rmsDb,
  synthBed,
  type BedSfx,
  type MusicBedId,
  type SfxKind,
} from '../sfx';
import { clamp } from './anim';
import { carriedInPlace, carryOrigins } from './carry';

/** The first scene is drawn this far ahead (mount.ts HOOK_LEAD_MS): its hits move up too. */
const HOOK_LEAD_MS = 650;
const ENTER = 80;
/** Ticks and pops closer than this to the previous hit are dropped (no machine-gun clicks). */
const MIN_GAP_MS = 150;

interface Hit {
  kind: SfxKind;
  atMs: number;
  gainDb: number;
  /** Placed by the creator or Pip (spec 37 R3.3): never thinned out. */
  added?: boolean;
  /** Index inside `plan.sfx` when `added === true`, for timeline retiming & removal. */
  addedIndex?: number;
  /** Optional human label attached to an added hit. */
  label?: string;
}

/** One resolved sound effect on a reel timeline (for both audio mixing and the timeline UI). */
export interface ReelSfxPlacement extends BedSfx {
  source: 'scene' | 'added';
  addedIndex?: number;
  label?: string;
}

const cues = (c: ReelScene['content']): number[] => {
  for (const key of ['items', 'words', 'rows', 'lines', 'steps'] as const) {
    const arr = (c as Record<string, unknown>)[key];
    if (Array.isArray(arr)) return (arr as { at: number }[]).map((x) => x.at);
  }
  return [];
};

/** The hits for one scene, on the reel timeline (before the hook lead shift). */
function sceneHits(s: ReelScene, origin: number, inPlace: boolean): Hit[] {
  const out: Hit[] = [];
  const c = s.content;
  const t0 = origin + ENTER;
  const graphic = s.layout !== 'speaker';
  // A graphic returning after another one still arrives with a whoosh; one carried straight on
  // from a speaker cut-away does not.
  if (graphic && !inPlace) out.push({ kind: 'whoosh', atMs: s.startMs + 70, gainDb: 0 });
  // Items: when the template actually reveals them (their cue, never before the entrance stagger).
  const stagger = (i: number, base: number, step: number, at: number) =>
    Math.max(at, t0 + base + i * step);
  const items = cues(c);
  switch (c.template) {
    case 'list':
      items.forEach((at, i) =>
        out.push({ kind: 'tick', atMs: stagger(i, 260, 140, at), gainDb: -2 }),
      );
      break;
    case 'stack':
      items.forEach((at, i) =>
        out.push({ kind: 'tick', atMs: stagger(i, 200, 160, at), gainDb: -2 }),
      );
      break;
    case 'checklist':
    case 'terminal':
    case 'quote':
      items.forEach((at, i) =>
        out.push({ kind: 'tick', atMs: stagger(i, 200, 160, at) + 120, gainDb: -3 }),
      );
      break;
    case 'statement':
      items.forEach((at, i) =>
        out.push({ kind: 'pop', atMs: stagger(i, 120, 160, at), gainDb: -6 }),
      );
      break;
    case 'flow':
      items.forEach((at, i) => out.push({ kind: 'pop', atMs: stagger(i, 0, 260, at), gainDb: -4 }));
      break;
    case 'compare':
      out.push({ kind: 'pop', atMs: t0 + 60, gainDb: -5 });
      out.push({ kind: 'pop', atMs: t0 + 320, gainDb: -3 });
      items.forEach((at, i) =>
        out.push({ kind: 'tick', atMs: stagger(i, 600, 160, at) + 200, gainDb: -3 }),
      );
      break;
    case 'logo':
      out.push({ kind: 'pop', atMs: t0 + 180, gainDb: 0 });
      break;
    case 'logos':
      items.forEach((at, i) =>
        out.push({ kind: 'pop', atMs: stagger(i, 0, 150, at) + 150, gainDb: -2 }),
      );
      break;
    case 'counter': {
      const dur = clamp((s.endMs - origin) * 0.55, 700, 1500);
      const land = t0 + 120 + dur;
      out.push({ kind: 'rise', atMs: land, gainDb: -4 });
      out.push({ kind: 'impact', atMs: land + 30, gainDb: -4 });
      break;
    }
    case 'progress': {
      const dur = Math.max(900, (s.endMs - origin) * 0.62);
      out.push({ kind: 'rise', atMs: t0 + 420 + dur, gainDb: -6 });
      out.push({ kind: 'pop', atMs: t0 + 420 + dur + 40, gainDb: -2 });
      break;
    }
    case 'chart':
      out.push({ kind: 'rise', atMs: t0 + 900, gainDb: -6 });
      break;
    case 'punch':
      out.push({ kind: 'impact', atMs: s.startMs + 110, gainDb: -2 });
      break;
    case 'cta':
      out.push({ kind: 'pop', atMs: s.startMs + 260, gainDb: 0 });
      break;
    case 'browser':
    case 'website':
      if (c.strikeAt !== undefined)
        out.push({ kind: 'impact', atMs: Math.max(c.strikeAt, t0 + 500) + 120, gainDb: -6 });
      break;
    default:
      break;
  }
  // Carried scenes only sound what is new.
  return s.carry ? out.filter((h) => h.kind === 'whoosh' || h.atMs >= s.startMs + 40) : out;
}

/**
 * Every effect in a reel with source metadata (auto scene-derived vs Pip/creator-added), sorted,
 * inside [0, durationMs), with takes rotating per kind so repeated hits never sound identical.
 * Single source of truth shared by `reelSfx` (audio mix) and the timeline `Sound` track.
 */
export function reelSfxPlacements(
  plan: Pick<ReelPlan, 'scenes'> & Partial<Pick<ReelPlan, 'sfx'>>,
  durationMs: number,
): ReelSfxPlacement[] {
  const hits: Hit[] = [];
  const origins = carryOrigins(plan.scenes);
  plan.scenes.forEach((s, i) => {
    const lead = i === 0 ? HOOK_LEAD_MS : 0;
    for (const h of sceneHits(s, origins.get(s) ?? s.startMs, carriedInPlace(plan.scenes, i))) {
      // Hits stay inside their scene (a late cue never sounds over the next scene's whoosh).
      const at = Math.min(h.atMs, s.endMs - 60) - lead;
      hits.push({ ...h, atMs: Math.max(i === 0 ? 0 : s.startMs, at) });
    }
  });
  (plan.sfx ?? []).forEach((a, idx) =>
    hits.push({
      kind: a.kind,
      atMs: a.atMs,
      gainDb: a.gainDb,
      added: true,
      addedIndex: idx,
      ...(a.label ? { label: a.label } : {}),
    }),
  );
  hits.sort((a, b) => a.atMs - b.atMs);
  const out: ReelSfxPlacement[] = [];
  const takes: Record<string, number> = {};
  let last = -Infinity;
  for (const h of hits) {
    if (h.atMs < 0 || h.atMs >= durationMs) continue;
    const soft = h.kind === 'tick' || h.kind === 'pop';
    if (soft && !h.added && h.atMs - last < MIN_GAP_MS) continue;
    const take = (takes[h.kind] = (takes[h.kind] ?? -1) + 1) % SFX_TAKES[h.kind];
    out.push({
      kind: h.kind,
      take,
      atMs: Math.round(h.atMs),
      gainDb: h.gainDb,
      source: h.added ? 'added' : 'scene',
      ...(h.addedIndex !== undefined ? { addedIndex: h.addedIndex } : {}),
      ...(h.label ? { label: h.label } : {}),
    });
    last = h.atMs;
  }
  return out;
}

/**
 * Every effect in a reel, sorted, inside [0, durationMs), with takes rotating per kind so
 * repeated hits never sound identical.
 */
export function reelSfx(
  plan: Pick<ReelPlan, 'scenes'> & Partial<Pick<ReelPlan, 'sfx'>>,
  durationMs: number,
): BedSfx[] {
  return reelSfxPlacements(plan, durationMs).map(({ kind, take, atMs, gainDb }) => ({
    kind,
    take,
    atMs,
    gainDb,
  }));
}

export interface ReelBedOptions {
  /** Measured voice level (dBFS), so effects sit under it. */
  voiceLevelDb: number;
  words: ReadonlyArray<{ startMs: number; endMs: number }>;
  sfx?: boolean;
  music?: MusicBedId | null;
  musicGainDb?: number;
  sfxGainDb?: number;
}

/** The reel's whole sound bed (effects + optional music, ducked under speech) at 24 kHz. */
export function reelBed(
  plan: Pick<ReelPlan, 'scenes'> & Partial<Pick<ReelPlan, 'sfx'>>,
  durationMs: number,
  o: ReelBedOptions,
): Float32Array {
  const music = o.music ? synthBed(o.music, durationMs, 7) : null;
  const depth = 9;
  return mixBed({
    durationMs,
    sampleRate: SFX_SAMPLE_RATE,
    voiceLevelDb: o.voiceLevelDb,
    music: music ? { samples: music, levelDb: rmsDb(music) } : null,
    musicGainDb: o.musicGainDb ?? -15,
    ducking: !!music,
    duckDepthDb: depth,
    envelope: music ? duckEnvelope(o.words, durationMs, { depthDb: depth }) : null,
    sfx: o.sfx === false ? [] : reelSfx(plan, durationMs),
    sfxGainDb: o.sfxGainDb ?? 0,
  }).samples;
}
