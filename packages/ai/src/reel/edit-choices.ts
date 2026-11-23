// Spec 39 R5.3–R5.5, R5.7: the creator's choices on the configure screen, applied to whatever plan
// a director returned (the cloud director or the free one). Pure: same plan + choices → same plan.
import {
  ReelPlanSchema,
  tileReelScenes,
  type MusicMood,
  type ReelCaptionStyle,
  type ReelHookStyle,
  type ReelPlan,
  type ReelScene,
  type ReelTheme,
  type ReelWord,
} from '@motionpop/schemas';
import { parseSpokenNumber } from '../slots/numbers';
import { cut } from './text';

export interface EditChoices {
  hookStyle?: ReelHookStyle;
  captions?: { enabled: boolean; style: ReelCaptionStyle };
  cta?: { enabled: boolean; text?: string };
  /** `auto` keeps the director's brief; `none` drops the music; any other mood replaces it. */
  music?: MusicMood;
  /** The style's colours (absent: keep the plan's). */
  theme?: ReelTheme;
}

/** Briefs for the named moods (no artist, song or brand names; instrumental). */
export const MOOD_BRIEFS: Readonly<Record<Exclude<MusicMood, 'auto' | 'none'>, string>> = {
  'minimal-tech':
    'Confident minimal tech house, soft synth plucks, tight hats, warm sub bass, 118 bpm',
  upbeat: 'Bright upbeat pop-electronic, punchy drums, playful synth hooks, claps, 124 bpm',
  lofi: 'Warm lo-fi hip hop, soft keys, brushed drums, gentle vinyl texture, 82 bpm',
  dramatic: 'Measured cinematic pulse, low strings, soft piano, steady deep drum, 96 bpm',
};

/** The shortest speaker CTA tail we cut from the last scene (ms). */
const CTA_MIN_MS = 900;
/** How long an appended CTA tail runs when there is room (ms). */
const CTA_MS = 1600;

/** "Comment LINK" → Comment / LINK; one word → Follow / word. Fits the schema's limits. */
export function ctaParts(text: string): { verb: string; keyword: string } {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (words.length <= 1) return { verb: 'Follow', keyword: cut(words[0] ?? 'for more', 16)! };
  const [verb, ...rest] = words;
  return { verb: cut(verb, 14)!, keyword: cut(rest.join(' '), 16)! };
}

function speaker(s: ReelScene, content: ReelScene['content']): ReelScene {
  const { carry, tag, bg, ...rest } = s;
  void carry;
  void tag;
  void bg;
  return { ...rest, layout: 'speaker', content };
}

function titleCase(words: readonly string[]): string {
  const t = words
    .map((w) => w.replace(/^["'“‘(]+|[.,;:!?…"'”’)]+$/g, ''))
    .filter(Boolean)
    .join(' ');
  return t ? t[0]!.toUpperCase() + t.slice(1) : '';
}

const wordsIn = (words: readonly ReelWord[], s: ReelScene) =>
  words.filter((w) => w.startMs >= s.startMs && w.startMs < s.endMs);

/** A said number in the scene (never invented): counter content, or null. */
function counterFrom(words: readonly ReelWord[], s: ReelScene): ReelScene['content'] | null {
  const ws = wordsIn(words, s);
  const tokens = ws.map((w) => w.text);
  for (let i = 0; i < tokens.length; i++) {
    const n = parseSpokenNumber(tokens, i);
    if (!n || n.kind === 'year' || !Number.isFinite(n.value)) continue;
    // "one thing" and "half" are words, not statistics (the free director skips them too).
    if (!n.unit && n.value < 2 && !/\d/.test(tokens[i] ?? '')) continue;
    const pct = n.unit === '%';
    const money = n.unit === '$' || n.unit === '£' || n.unit === '€' ? n.unit : '';
    const label = cut(titleCase(tokens.slice(n.end, n.end + 3)), 36) ?? 'And counting';
    return {
      template: 'counter',
      value: n.value,
      decimals: Number.isInteger(n.value) ? 0 : Math.round(n.value * 10) / 10 === n.value ? 1 : 2,
      prefix: money,
      suffix: pct ? '%' : n.unit === 'x' ? 'x' : '',
      label,
    } as ReelScene['content'];
  }
  return null;
}

function headlineFor(plan: ReelPlan, words: readonly ReelWord[], s: ReelScene) {
  const title =
    cut(plan.hook, 60) ??
    cut(
      titleCase(
        wordsIn(words, s)
          .slice(0, 4)
          .map((w) => w.text),
      ),
      60,
    );
  return title ? ({ template: 'headline', title } as ReelScene['content']) : null;
}

const VISUAL = new Set(['image', 'logo', 'logos', 'website']);

function shapeHook(plan: ReelPlan, words: readonly ReelWord[], style: ReelHookStyle): ReelPlan {
  const first = plan.scenes[0];
  if (!first) return plan;
  const layoutFor = (): ReelScene['layout'] =>
    first.layout === 'speaker' ? (plan.look === 'mono' ? 'split' : 'card') : first.layout;
  let content: ReelScene['content'] | null = null;
  if (style === 'stat' && first.content.template !== 'counter') {
    content =
      counterFrom(words, first) ??
      (first.layout === 'speaker' ? headlineFor(plan, words, first) : null);
  } else if (
    style === 'visual' &&
    !VISUAL.has(first.content.template) &&
    first.layout === 'speaker'
  ) {
    content = headlineFor(plan, words, first);
  } else if (style === 'headline' && first.layout === 'speaker') {
    content = headlineFor(plan, words, first);
  }
  let scenes = plan.scenes;
  if (content) {
    const { carry, ...rest } = first;
    void carry;
    scenes = [{ ...rest, layout: layoutFor(), content }, ...plan.scenes.slice(1)];
  }
  const next: ReelPlan = { ...plan, scenes, hookStyle: style };
  if (style === 'cold-open') delete next.hook;
  return next;
}

/** Below this length a reel gets no automatic CTA (there is no room for an ask). */
export const CTA_MIN_REEL_MS = 6000;

/** Words that never become a comment keyword ("comment below", "drop a comment", "comment what…"). */
const NOT_KEYWORD =
  /^(a|an|the|it|this|that|below|down|here|your|you|me|us|in|on|if|and|with|what|how|word|comment|comments)$/;

/**
 * Spoken asks → the CTA text. `comment` takes the next word as the keyword; `drop` counts only as
 * "drop the word X" or "drop X in the comments", since "prices drop" is not an ask.
 */
const CTA_ASKS: ReadonlyMap<string, string | null> = new Map([
  ['comment', null],
  ['drop', null],
  ['follow', 'Follow for more'],
  ['save', 'Save this'],
  ['share', 'Share this'],
  ['send', 'Send this'],
  ['subscribe', 'Subscribe now'],
  ['try', 'Try this'],
]);

/**
 * The ask when the creator turned the CTA on but wrote none and the director made none (spec 39
 * R5.4, found in the AI soak: 9 of 19 directed reels came back without one). The speaker's own
 * ask in the last third of the reel wins ("comment LINK", "save it for later"); otherwise a
 * plain "Follow for more".
 */
export function defaultCtaText(words: readonly ReelWord[]): string {
  const tail = words.slice(Math.floor(words.length * 0.66));
  const clean = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  for (let i = 0; i < tail.length; i++) {
    const key = clean(tail[i]!.text);
    // A Map, not an object: a spoken "constructor" must not hit Object.prototype.
    if (!CTA_ASKS.has(key)) continue;
    const fixed = CTA_ASKS.get(key);
    if (fixed) return fixed;
    const next = tail.slice(i + 1, i + 6).map((w) => clean(w.text));
    const isKeyword = (w: string | undefined): w is string =>
      !!w && !NOT_KEYWORD.test(w) && !CTA_ASKS.has(w);
    if (key === 'comment') {
      const keyword = next.slice(0, 2).find(isKeyword);
      return keyword ? `Comment ${keyword.toUpperCase()}` : 'Comment below';
    }
    // `drop`: "drop the word GUIDE" or "drop GUIDE in the comments"; anything else keeps scanning
    // (a following "comment" or "follow" is still found: "drop a comment below", "drop me a follow").
    const word = next.indexOf('word');
    const comments = next.findIndex((w) => w === 'comment' || w === 'comments');
    const keyword =
      word >= 0 && isKeyword(next[word + 1])
        ? next[word + 1]
        : comments > 0
          ? next.slice(0, comments).find(isKeyword)
          : undefined;
    if (keyword) return `Comment ${keyword.toUpperCase()}`;
  }
  return 'Follow for more';
}

function shapeCta(
  plan: ReelPlan,
  cta: NonNullable<EditChoices['cta']>,
  durationMs: number,
  words: readonly ReelWord[] = [],
): ReelPlan {
  if (!cta.enabled) {
    return {
      ...plan,
      scenes: plan.scenes.map((s) =>
        s.content.template === 'cta' ? speaker(s, { template: 'none' }) : s,
      ),
    };
  }
  const hasCta = plan.scenes.some((s) => s.content.template === 'cta');
  const text =
    cta.text?.trim() || (hasCta || durationMs < CTA_MIN_REEL_MS ? '' : defaultCtaText(words));
  if (!text) return plan;
  const content = { template: 'cta', ...ctaParts(text) } as ReelScene['content'];
  // The creator's ask replaces the director's: one cta scene, at the end.
  const scenes = plan.scenes.map((s) =>
    s.content.template === 'cta' ? speaker(s, { template: 'none' }) : s,
  );
  const last = scenes[scenes.length - 1]!;
  const lastLen = last.endMs - last.startMs;
  if (last.layout === 'speaker' || lastLen < CTA_MIN_MS * 2) {
    // A speaker tail (or a scene too short to split) becomes the ask.
    scenes[scenes.length - 1] = speaker(last, content);
  } else {
    const tail = Math.min(CTA_MS, Math.max(CTA_MIN_MS, Math.floor(lastLen / 2)));
    const at = durationMs - tail;
    scenes[scenes.length - 1] = { ...last, endMs: at };
    scenes.push(
      speaker(
        { ...last, id: `${last.id.slice(0, 36)}-cta`, startMs: at, endMs: durationMs },
        content,
      ),
    );
    delete scenes[scenes.length - 1]!.notes;
  }
  return { ...plan, scenes };
}

/**
 * Applies the configure-screen choices to a directed plan (spec 39 §5.2). The look is never
 * changed here: it is chosen before the director runs (review fix #18). Always returns a valid,
 * tiled plan.
 */
export function applyEditChoices(
  plan: ReelPlan,
  words: readonly ReelWord[],
  durationMs: number,
  choices: EditChoices,
): ReelPlan {
  let next: ReelPlan = { ...plan, scenes: [...plan.scenes] };
  if (choices.hookStyle) next = shapeHook(next, words, choices.hookStyle);
  if (choices.cta) next = shapeCta(next, choices.cta, durationMs, words);
  if (choices.captions) {
    next.captions = choices.captions.enabled;
    next.captionStyle = choices.captions.style;
  }
  if (choices.theme) next.theme = choices.theme;
  if (choices.music === 'none') delete next.music;
  else if (choices.music && choices.music !== 'auto')
    next.music = { brief: MOOD_BRIEFS[choices.music] };
  return ReelPlanSchema.parse({ ...next, scenes: tileReelScenes(next.scenes, durationMs) });
}
