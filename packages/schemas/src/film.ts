import { z } from 'zod';
import { BeatArchetypeSchema, isMediaStageMode, VideoStageModeSchema } from './video';

/**
 * Film mode (spec 07b): the storyboard a Director model writes for a whole voiceover, and the
 * times its beats play at. A film is one world: the beats tile the narration from the first word
 * to the last, every beat has a picture of its own, and every boundary has a seam both beats
 * follow.
 */
export const SEAM_KINDS = ['push', 'lift', 'cover', 'zoom', 'match'] as const;
export type SeamKind = (typeof SEAM_KINDS)[number];
export const BEAT_LEADS = ['picture', 'map', 'number', 'type'] as const;
export type BeatLead = (typeof BEAT_LEADS)[number];

/** A beat shorter than this can't land an idea; the Director is asked to merge it. */
export const FILM_MIN_BEAT_MS = 1600;
/** Talking-head Reels support tighter clause-synced beats (spec 24 R1.4). */
export const REEL_MIN_BEAT_MS = 1200;
/** A beat longer than this drags; the Director is asked to split it. */
export const FILM_MAX_BEAT_MS = 9000;
export const FILM_MAX_BEATS = 40;
/** Longest voiceover a film is made for in one go. */
export const FILM_MAX_MS = 180_000;
/** Words of on-screen copy a beat may carry. */
export const FILM_MAX_TEXT_WORDS = 14;
/** How long a beat stays in front of (or under) the next one, per seam kind. */
export const SEAM_TAIL_MS: Readonly<Record<SeamKind, number>> = {
  push: 0,
  lift: 500,
  cover: 500,
  zoom: 0,
  match: 0,
};
export const SEAM_OVER: Readonly<Record<SeamKind, 'out' | 'in'>> = {
  push: 'out',
  lift: 'out',
  cover: 'in',
  zoom: 'out',
  match: 'out',
};

/** A film is priced per started 30 s of voiceover. */
export const FILM_UNIT_MS = 30_000;
/** Units of the `film` credit action for a voiceover of this length (at least 1). */
export function filmUnits(durationMs: number): number {
  return Math.max(1, Math.ceil(Math.max(0, durationMs) / FILM_UNIT_MS));
}

export const StorySeamSchema = z.object({
  kind: z.enum(SEAM_KINDS),
  /** What both sides do: the object that carries the cut, with any shared numbers. */
  note: z.string().max(400),
});
export type StorySeam = z.infer<typeof StorySeamSchema>;

export const StoryBeatSchema = z.object({
  id: z.string().min(1).max(12),
  /** Inclusive indexes into the transcript's words. */
  wordStart: z.number().int().nonnegative(),
  wordEnd: z.number().int().nonnegative(),
  lead: z.enum(BEAT_LEADS),
  /** Visual archetype rotated across beats for variety (spec 19). */
  archetype: BeatArchetypeSchema.optional(),
  /** Coupled speaker video framing for this beat on video projects (spec 19 + 20). */
  videoStage: VideoStageModeSchema.optional(),
  /** Speaker focal point 0..1 across frame (optional, inferred from keyframes). */
  focusX: z.number().min(0).max(1).optional(),
  focusY: z.number().min(0).max(1).optional(),
  /** Optional Media Bin clip bound to this beat (spec 20). Tolerates model sentinels ("", "none", 0). */
  clipId: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() && v.trim() !== 'none' ? v.trim() : undefined),
    z.string().min(1).max(64).optional(),
  ),
  clipStartMs: z.preprocess(
    (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : undefined),
    z.number().int().nonnegative().optional(),
  ),
  clipEndMs: z.preprocess(
    (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : undefined),
    z.number().int().nonnegative().optional(),
  ),
  clipFocusX: z.preprocess(
    (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1 ? v : undefined),
    z.number().min(0).max(1).optional(),
  ),
  clipFocusY: z.preprocess(
    (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1 ? v : undefined),
    z.number().min(0).max(1).optional(),
  ),
  clipZoom: z.preprocess(
    (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 1 ? Math.min(2.4, v) : undefined),
    z.number().min(1).max(2.4).optional(),
  ),
  /** Optional external stock B-roll search query (Pexels / Wikimedia Commons, spec 23 R6). */
  brollQuery: z.preprocess(
    (v) =>
      typeof v === 'string' && v.trim() && v.trim() !== 'none' ? v.trim().slice(0, 100) : undefined,
    z.string().min(2).max(100).optional(),
  ),
  /** Optional AI-generated studio cutout or editorial visual subject (`mp.image`, spec 23 R6). */
  imageSubject: z.preprocess(
    (v) =>
      typeof v === 'string' && v.trim() && v.trim() !== 'none' ? v.trim().slice(0, 120) : undefined,
    z.string().min(3).max(120).optional(),
  ),
  /** True when `imageSubject` should be chroma-keyed into a floating cutout (spec 23 R6). */
  imageKeyed: z.boolean().optional(),
  /** The picture: what the viewer sees, concretely. */
  idea: z.string().min(8).max(500),
  /** On-screen copy, exact strings: the hero first, then a quiet label. */
  text: z.array(z.string().min(1).max(70)).max(3),
  /** Transcript index of the word the hero lands on. */
  landsOn: z.number().int().nonnegative(),
  /** The order of reveals, each tied to a spoken word. */
  staging: z.string().max(700),
  /** The seam into the next beat (ignored on the last beat, which holds). */
  seam: StorySeamSchema,
});
export type StoryBeat = z.infer<typeof StoryBeatSchema>;

export const StoryPropSchema = z.object({
  id: z.string().min(2).max(24),
  /** What to draw, in one or two sentences: view, parts, proportions. */
  draw: z.string().min(8).max(500),
  /** The drawing's box (its viewBox), in any unit: only the ratio matters. */
  width: z.number().positive().max(4000),
  height: z.number().positive().max(4000),
});
export type StoryProp = z.infer<typeof StoryPropSchema>;

export const REEL_TONES = ['personal-story', 'tech-explainer', 'listicle', 'hot-take'] as const;
export type ReelTone = (typeof REEL_TONES)[number];

export const StoryboardSchema = z.object({
  title: z.string().min(1).max(80),
  /** Content tone used to calibrate visual density vs clean breathing beats (spec 23 R7). */
  tone: z.enum(REEL_TONES).optional(),
  /** The one thing the viewer should leave with. */
  thesis: z.string().min(1).max(240),
  /** The world every beat lives in: ground, materials, the map if there is one. */
  world: z.string().min(1).max(600),
  /** The recurring element the eye follows from beat to beat. */
  carrier: z.string().min(1).max(400),
  /** Drawings shared by several beats (the recurring element, usually). */
  props: z.array(StoryPropSchema).max(3),
  beats: z.array(StoryBeatSchema).min(1).max(FILM_MAX_BEATS),
});
export type Storyboard = z.infer<typeof StoryboardSchema>;

export interface FilmWord {
  text: string;
  startMs: number;
  endMs: number;
}

/** A beat with its place in time (integer ms from the start of the voiceover). */
export interface TimedBeat extends StoryBeat {
  startMs: number;
  endMs: number;
  /** Slot-local time of the word the hero lands on. */
  keyMomentMs: number;
  /** How long the beat stays on after its slot ends, and whether in front of the next beat. */
  tailMs: number;
  over: 'out' | 'in';
  /** How long the previous beat is still on screen at this beat's start. */
  headMs: number;
}

/** A beat opens this long before its first word, so its first move is under way as the line starts. */
export const FILM_LEAD_IN_MS = 250;

/**
 * Where each beat plays. Beats tile the voiceover: the first starts at 0, each next one starts a
 * little before its first word (never before the previous beat's last word has ended) and every
 * beat ends where the next begins; the last ends with the voiceover. Integer ms. Pure.
 */
export function timeBeats(
  board: Pick<Storyboard, 'beats'>,
  words: readonly FilmWord[],
  durationMs: number,
): TimedBeat[] {
  const starts = board.beats.map((b, i) => {
    if (i === 0) return 0;
    const first = words[b.wordStart]?.startMs ?? 0;
    const prev = board.beats[i - 1] as StoryBeat;
    const prevEnd = words[prev.wordEnd]?.endMs ?? first;
    return Math.round(Math.min(durationMs - 1, Math.max(prevEnd, first - FILM_LEAD_IN_MS)));
  });
  return board.beats.map((b, i) => {
    const startMs = starts[i] as number;
    const last = i === board.beats.length - 1;
    const endMs = last ? durationMs : (starts[i + 1] as number);
    const len = Math.max(1, endMs - startMs);
    const land = words[b.landsOn]?.startMs ?? startMs + len * 0.4;
    const next = board.beats[i + 1];
    // The last beat holds to the end: nothing follows it.
    const tail = last ? 0 : SEAM_TAIL_MS[b.seam.kind];
    const prev = board.beats[i - 1];
    return {
      ...b,
      startMs,
      endMs,
      keyMomentMs: Math.round(Math.min(len, Math.max(0, land - startMs))),
      // A tail never runs past the middle of the next beat.
      tailMs: next
        ? Math.min(tail, Math.max(0, Math.floor(((starts[i + 2] ?? durationMs) - endMs) / 2)))
        : 0,
      over: SEAM_OVER[b.seam.kind],
      headMs: prev ? SEAM_TAIL_MS[prev.seam.kind] : 0,
    };
  });
}

const countWords = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

const SPELLED: Readonly<Record<string, string>> = {
  zero: '0',
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
  ten: '10',
  eleven: '11',
  twelve: '12',
  twenty: '20',
  thirty: '30',
  forty: '40',
  fifty: '50',
  sixty: '60',
  seventy: '70',
  eighty: '80',
  ninety: '90',
  hundred: '100',
  thousand: '1000',
  million: '1000000',
  billion: '1000000000',
  half: '0.5',
  first: '1',
  second: '2',
  third: '3',
};

const TENS: ReadonlySet<string> = new Set(['20', '30', '40', '50', '60', '70', '80', '90']);
const ONES: ReadonlySet<string> = new Set(['1', '2', '3', '4', '5', '6', '7', '8', '9']);

/** The numbers written in a piece of text, as plain digits ("3,500 miles" → ["3500"]). */
export function numbersIn(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
    const n = m[0].replace(/,/g, '').replace(/\.$/, '');
    out.push(String(Number(n)));
  }
  return out;
}

/**
 * Every number the narration says, as plain digits, spelled-out numbers and compound tens+ones
 * ("forty-five" / "forty five" → "45") included. Film mode shows no figure that isn't in here:
 * a made-up statistic on screen is the one mistake a creator can't forgive.
 */
export function spokenNumbers(words: readonly { text: string }[]): Set<string> {
  const out = new Set<string>();
  const parts: string[] = [];
  for (const w of words) {
    for (const n of numbersIn(w.text)) out.add(n);
    for (const part of w.text.toLowerCase().split(/[^a-z]+/)) {
      if (!part) continue;
      parts.push(part);
      const n = SPELLED[part];
      if (n) out.add(n);
    }
  }
  for (let i = 0; i + 1 < parts.length; i++) {
    const a = SPELLED[parts[i]!];
    const b = SPELLED[parts[i + 1]!];
    if (a && b && TENS.has(a) && ONES.has(b)) {
      out.add(String(Number(a) + Number(b)));
    }
  }
  return out;
}

/** Numbers in `text` the narration never says. Counting numbers up to 10 are always fine. */
export function unspokenNumbers(text: string, spoken: ReadonlySet<string>): string[] {
  return numbersIn(text).filter((n) => {
    if (spoken.has(n)) return false;
    const v = Number(n);
    return !(Number.isInteger(v) && v >= 0 && v <= 10);
  });
}

/**
 * What is wrong with a storyboard for this transcript, as lines a model can fix; empty when it
 * can be built. The beats must tile the words in order, land inside themselves, be long enough
 * to read and short enough to hold, and not lean on type.
 */
export function storyboardIssues(
  board: Storyboard,
  words: readonly FilmWord[],
  durationMs: number,
  opts?: { hasVideo?: boolean; mediaBinIds?: readonly string[] },
): string[] {
  const issues: string[] = [];
  const n = words.length;
  const ids = new Set<string>();
  let expect = 0;
  board.beats.forEach((b, i) => {
    const name = `beat ${i + 1} (${b.id})`;
    if (ids.has(b.id)) issues.push(`${name}: the id "${b.id}" is used twice`);
    ids.add(b.id);
    if (b.wordStart !== expect)
      issues.push(
        `${name}: wordStart is ${b.wordStart} but the previous beat ended at word ${expect - 1}; beats must cover every word in order with no gap or overlap (expected wordStart ${expect})`,
      );
    if (b.wordEnd < b.wordStart)
      issues.push(`${name}: wordEnd ${b.wordEnd} is before wordStart ${b.wordStart}`);
    if (b.wordEnd >= n)
      issues.push(`${name}: wordEnd ${b.wordEnd} is past the last word (${n - 1})`);
    if (b.landsOn < b.wordStart || b.landsOn > b.wordEnd)
      issues.push(`${name}: landsOn ${b.landsOn} is outside its words ${b.wordStart}–${b.wordEnd}`);
    const text = b.text.reduce((sum, t) => sum + countWords(t), 0);
    if (text > FILM_MAX_TEXT_WORDS)
      issues.push(
        `${name}: ${text} words of on-screen text; keep it to ${FILM_MAX_TEXT_WORDS} or fewer`,
      );
    expect = Math.max(expect, b.wordEnd + 1);
  });
  if (board.beats.length && expect !== n)
    issues.push(
      `the last beat ends at word ${expect - 1} but the narration has words 0–${n - 1}; cover them all`,
    );
  if (issues.length) return issues;
  const minBeatMs = opts?.hasVideo ? REEL_MIN_BEAT_MS : FILM_MIN_BEAT_MS;
  for (const b of timeBeats(board, words, durationMs)) {
    const len = b.endMs - b.startMs;
    if (len < minBeatMs)
      issues.push(
        `beat ${b.id} lasts ${(len / 1000).toFixed(1)} s, too short to land an idea: merge it with a neighbour`,
      );
    if (len > FILM_MAX_BEAT_MS)
      issues.push(
        `beat ${b.id} lasts ${(len / 1000).toFixed(1)} s: split it at a clause so each part is under ${FILM_MAX_BEAT_MS / 1000} s`,
      );
  }
  const spoken = spokenNumbers(words);
  for (const b of board.beats) {
    for (const t of b.text) {
      const made = unspokenNumbers(t, spoken);
      if (made.length)
        issues.push(
          `beat ${b.id}: the text "${t}" shows ${made.join(', ')}, which the narration never says; use only figures from the narration`,
        );
    }
  }
  // Voiceover-only documentaries need pictures; talking-head Reels have the human speaker on screen (spec 24 R1.4).
  if (!opts?.hasVideo) {
    const typeLed = board.beats.filter((b) => b.lead === 'type').length;
    const allowed = Math.max(2, Math.floor(board.beats.length / 4));
    if (typeLed > allowed)
      issues.push(
        `${typeLed} beats are led by type; at most ${allowed} may be: give the others a picture`,
      );
  }
  const propIds = new Set<string>();
  for (const p of board.props) {
    if (!/^[a-z][a-z0-9-]*$/.test(p.id))
      issues.push(`prop id "${p.id}" must be lowercase letters, digits and dashes`);
    if (propIds.has(p.id)) issues.push(`prop id "${p.id}" is used twice`);
    propIds.add(p.id);
  }
  // Spec 19 R3.2 + Spec 24 R1.4: prevent identical consecutive archetypes (except clean breathing beats).
  for (let i = 1; i < board.beats.length; i++) {
    const prev = board.beats[i - 1] as StoryBeat;
    const cur = board.beats[i] as StoryBeat;
    if (cur.videoStage === 'clean' && prev.videoStage === 'clean') continue;
    if (cur.archetype && prev.archetype && cur.archetype === prev.archetype) {
      issues.push(
        `beat ${i + 1} (${cur.id}) repeats archetype "${cur.archetype}" from beat ${i} (${prev.id}); pick a different archetype`,
      );
    }
  }
  if (opts?.hasVideo && board.beats.length >= 3) {
    for (let i = 1; i < board.beats.length; i++) {
      const prevStage = board.beats[i - 1]?.videoStage;
      const curStage = board.beats[i]?.videoStage;
      if (prevStage === 'cutaway' && curStage === 'cutaway') {
        issues.push(
          `beats ${i} and ${i + 1} are both "cutaway", hiding the speaker too long; switch one to "split-top-stage", "top-card", or "clean" so the speaker stays connected`,
        );
      }
    }
    const cutaways = board.beats.filter((b) => b.videoStage === 'cutaway').length;
    const maxCutaways =
      board.tone === 'personal-story' ? 1 : Math.max(1, Math.floor(board.beats.length * 0.2));
    if (cutaways > maxCutaways) {
      issues.push(
        `${cutaways} beats use "cutaway" (hiding the speaker); keep at most ${maxCutaways} cutaway ${maxCutaways === 1 ? 'beat' : 'beats'} and use "split-top-stage", "top-card", or "clean" on the rest`,
      );
    }
    // Locked primary stages (`split-top-stage` up to 6 in a row, `clean` up to 4) create cohesive
    // studio Reels (spec 24 R1.4); legacy stages (`full`, `pip`, `backdrop`, `split-left`, `split-right`)
    // still flag 3 consecutive repetitions.
    for (let i = 2; i < board.beats.length; i++) {
      const a = board.beats[i - 2]?.videoStage;
      const b = board.beats[i - 1]?.videoStage;
      const c = board.beats[i]?.videoStage;
      if (!a || !b || !c || a !== b || b !== c) continue;
      if (c === 'split-top-stage' || c === 'clean' || c === 'top-card') continue;
      issues.push(
        `beats ${i - 1}–${i + 1} all stay in videoStage "${c}"; vary the speaker framing (e.g. split-top-stage, top-card, clean) so the video flows`,
      );
    }
  }
  // Spec 20 R2.2 + Spec 24 R1.4: validate Media Bin clip bindings, allowing `brollQuery` stock fetch before resolution.
  const knownClips = opts?.mediaBinIds ? new Set(opts.mediaBinIds) : null;
  for (let i = 0; i < board.beats.length; i++) {
    const b = board.beats[i] as StoryBeat;
    const isMedia = b.videoStage ? isMediaStageMode(b.videoStage) : false;
    const hasStockQuery = Boolean(b.brollQuery) && b.videoStage !== 'screen-showcase';
    if (knownClips) {
      if (b.clipId && !knownClips.has(b.clipId)) {
        issues.push(
          `beat ${i + 1} (${b.id}) references unknown clipId "${b.clipId}"; pick an id from the Media Bin or omit clipId`,
        );
      }
      if (isMedia && !b.clipId && !hasStockQuery) {
        issues.push(
          knownClips.size > 0
            ? `beat ${i + 1} (${b.id}) uses videoStage "${b.videoStage}" without a clipId; set clipId from the Media Bin`
            : `beat ${i + 1} (${b.id}) uses media videoStage "${b.videoStage}" without a clipId or brollQuery; set brollQuery or use split-top-stage, top-card, or clean`,
        );
      }
    } else if (isMedia && !b.clipId && !hasStockQuery) {
      issues.push(
        `beat ${i + 1} (${b.id}) uses media videoStage "${b.videoStage}" without a clipId`,
      );
    }
  }
  return issues;
}

/**
 * What a project keeps of its film (spec 07b R5.4): the storyboard and the shared drawings, so
 * one beat can be rebuilt later without the others and the plan can be shown.
 */
export const ProjectFilmSchema = z.object({
  storyboard: StoryboardSchema,
  props: z.record(z.string().max(40), z.string().max(8000)),
  /** Epoch ms. */
  madeAt: z.number().int().nonnegative(),
  model: z.string().max(80).optional(),
});
export type ProjectFilm = z.infer<typeof ProjectFilmSchema>;
