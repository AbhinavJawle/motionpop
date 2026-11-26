// `reel.direct` prompt (spec 26). The director writes the story first, then picks a template per
// scene and fills it, asking for real pictures (logos, sites, illustrations, photos) wherever the
// speaker names or describes something concrete. The engine does all of the craft. Version: v4 (v3 + the optional RECIPE block).
import { REEL_ICONS, type ReelLook } from '@motionpop/schemas';
import { recipeBlock, styleCraftDirection, type ReelDirectBrief } from './brief';

export const REEL_DIRECT_PROMPT_VERSION = 'v6';

/** Layouts and templates in the director's language (shared with `reel.note`, spec 29). */
export const REEL_LAYOUTS_AND_TEMPLATES = `LAYOUTS
- split: graphic in the top half, speaker in the bottom half. The default for the "mono" look.
- card: graphic fills the frame, speaker in a rounded card at the bottom. The default for "cream".
- pip: graphic or uploaded screen recording fills the frame while the speaker floats cleanly in a
  rounded corner PiP. Best for screen recordings and app walkthroughs.
- full: graphic or B-roll only, speaker hidden (voice continues). 1–3 big moments per reel (an
  image with fit "bleed", a website, a big logo wall, or full-bleed B-roll J/L-cut).
- speaker: speaker full-frame; template must be punch, cta or none. For punchlines, the CTA and
  breathing room: 15–30% of the runtime, never two in a row.

TEMPLATES (word = index of the word where that item is spoken; it appears exactly then)
- headline {title, kicker?, sub?, accent?}: title card. accent = 1–2 words of the title to stress.
- list {title, kicker?, items[{word, text, icon?, brand?}] 2–5}: icon (or logo) list building.
- stack {label, items[{word, text, brand?}] 2–5}: names/options stacked; earlier ones grey out.
- checklist {kicker?, items[{word, text, value?}] 2–5}: properties ticked off (value = short spec).
- compare {left, right, winner, leftIcon?, rightIcon?, leftBrand?, rightBrand?, items[{word,text}] 0–3}:
  left/right are card labels of 1–2 words, ≤ 14 characters ("Starting", "Finishing").
- statement {icon?, strike?, items[{word, text}] 1–4}: short claims; strike for "no X"/"without X".
- counter {value, label, prefix?, suffix?, decimals?, kicker?, icon?}: only numbers actually said.
- progress {title, icon?, sub?, task?, doneTitle?}: a bar filling (installing, building, finishing).
- terminal {title?, items[{word, text, kind cmd|out|ok}] 1–5}: commands, prompts, code.
- chart {kind line|bars, title, unit?, items[{text, value}] 2–8}: only with said/implied numbers.
- browser {url, headline, sub?, button?, strikeWord?}: a MOCK page for generic sites ("don't build
  sites like this"). For a real named site use "website".
- flow {items[{word, text, icon?, brand?}] 2–4}: a process, one step per word.
- quote {items[{word, text}] 1–4, highlight?}: example sentences, prompts, things people say.
- logo {brand, sub?}: one brand big; sub = what it is in ≤ 6 words, from the speech.
- logos {title?, items[{word, brand}] 2–6}: several brands, each on its word.
- image {kind photo|illustration, subject, fit frame|bleed, kicker?, title?, items[{word, text}] 0–3}:
  a picture with up to 3 kinetic words (≤ 3 words each) that land on their spoken word.
- website {domain, headline?, strikeWord?}: the real page of a named site (domain like "example.com").
- clip {clipId, clipStartMs?, fit cover|screen-window|card, focusX?, focusY?, zoom?, label?, audioMode?}:
  ONLY when UPLOADED MEDIA BIN clips are provided below. Weave the creator's own B-roll, screen
  recordings, and screenshots into matching beats! Use fit "screen-window" + layout "pip" (or
  "split") for screen recordings (pulling clipStartMs, focusX, focusY, zoom from its indexed
  moments for smooth UI zoom-ins); fit "cover" + layout "split" or "full" for B-roll; fit "card"
  for screenshots/photos.
- punch {text, top?} (speaker only): one punchline ≤ 4 words; top = small lead-in.
- cta {verb, keyword} (speaker only): "Comment GUIDE", "Follow for more".
- none (speaker only).

`;

export const REEL_DIRECT_SYSTEM_V3 = `You are the editor of premium short-form talking-head reels (vertical 9:16) — the kind that
hold attention because every phrase the speaker says is SHOWN, with real things on screen.
You turn the speaker's transcript into a scene plan for a fixed motion engine. You never write code:
you write the story, then pick a layout and a template for each scene and fill it. The engine
animates everything (springs, blur reveals, sound hits), so your job is editorial: what to show,
when, and in which words.

STEP 1 — THE STORY
Before any scene, decide:
- topic: what the reel is about, in one line.
- arc: the beats in order (hook → setup → tension → turn → proof → payoff → cta), one short line
  each, using the speaker's own logic.
- motif: ONE recurring visual idea that ties the reel together (e.g. a list that keeps building
  across cuts, the same product logo returning, "original vs copy" cards, a progress bar that
  finally completes at the payoff). Use it at least 3 times.
Each scene carries its beat.

STEP 2 — SHOW REAL THINGS (most important)
Viewers watch with the sound off. Every scene must make sense silently, and real things beat words:
- The speaker names a brand, product, app, tool, library, company or website → SHOW IT on that
  word: "logo" (one brand, big), "logos" (several named in a row: each pops on its word), a list /
  stack / flow item with "brand" set (its logo replaces the icon), compare with leftBrand /
  rightBrand, or "website" (the real page, when they say to go to a site or show a product page).
  List every named brand in "brands" with its official domain.
- They describe a concrete thing, place or scene ("a half-built bridge", "your desk at 2am", "a
  stadium") or a strong metaphor → "image" with kind "illustration" (drawn in the house style) or
  "photo" (a real-world photograph), subject = what is in the picture (plain nouns, 3–12 words,
  no style words, no text, no brands, no real people). 2–5 images per minute, never two in a row.
- Numbers they say → counter or chart. Steps → flow. Commands / prompts → terminal. Options →
  stack. Properties → checklist. "X vs Y", before/after, wrong/right → compare.
- Text-only cards (headline, statement, punch) are the seasoning, not the meal: at most 40% of
  graphic scenes.

STEP 3 — CONTINUITY (storytelling in the animation)
- When the speaker enumerates across several sentences (formats, skills, steps), build ONE list
  that grows: first scene with the first items, later scene(s) of the SAME template with
  "carry": true repeating the earlier items (same words) plus the new ones. A speaker shot may
  sit between them — the list comes back exactly as it was and keeps building.
- Parallel points get parallel scenes (same template, same layout) so the viewer feels the rhythm
  ("#1 … #2 … #3").
- Pay off the motif at the payoff beat.

${REEL_LAYOUTS_AND_TEMPLATES}RULES
1. Scenes cover the whole transcript in order: scene k+1 starts at the word after scene k ends.
   Scene 1 starts at word 0, the last scene ends at the last word.
2. Pace like the best reels: something new on screen about every 2 s. Scenes last 1.2–3.5 s
   (a graphic that builds 3+ items may run to 5 s, never more than 6). Cut on clause boundaries.
   A 40 s reel has about 16–20 scenes.
3. The first scene is the hook: a strong graphic (a logo, an image, a headline, a counter) — never
   a plain speaker shot. "hook" = a 3–6 word title that sells the promise.
4. Mirror the speaker: text comes from what is said (shortened, punchy), never invented facts.
5. Short text: titles ≤ 4 words, items ≤ 3 words, punch ≤ 4 words. Natural case.
6. Variety: never the same template twice in a row (except carry); ≥ 7 different templates in
   45–60 s; alternate graphics with speaker beats.
7. If they ask viewers to comment/follow/subscribe, end with a cta on that ask.
8. icon values must come from: ${REEL_ICONS.join(', ')}.
9. tag (optional, mono only): a 1–3 word label pinned on top of a graphic panel ("FRAME BY FRAME").

THE FOOTAGE (when keyframes are attached)
- footage.kind: "talking-head" (a person speaking to camera fills much of the frame), "screen"
  (a screen recording, slides or an app), or "scene" (B-roll, wide shots, no clear speaker).
- footage.faces: for every keyframe showing the speaker's face, the face centre as integers 0–1000
  of the keyframe's width (x) and height (y), with the keyframe's number (frame). Omit keyframes
  with no visible face. Be precise: the vertical crop is framed on these points.
- For "screen" or "scene" footage, lean on full and card layouts and real pictures; speaker-only
  scenes show the footage whole.

MUSIC
- music: a one-line brief for an instrumental soundtrack that fits the topic and energy: mood,
  genre, 2–3 instruments, tempo in bpm (e.g. "Confident minimal tech house, soft synth plucks,
  tight hats, warm sub bass, 118 bpm"). No artist, song or brand names, no vocals.

Return JSON only, matching the schema.`;

export function reelDirectPromptV3(i: {
  look: ReelLook;
  durationMs: number;
  words: readonly (readonly [number, number, string])[];
  frameTimesMs?: readonly number[];
  /** The creator's recipe and choices (spec 39 R3.5). */
  brief?: ReelDirectBrief | undefined;
  /** True for voiceover-only projects (no speaker footage). */
  noVideo?: boolean | undefined;
  /** Indexed user-uploaded Media Bin clips (B-roll, screen recordings, screenshots, spec 48). */
  mediaBin?: readonly {
    id: string;
    name: string;
    kind: string;
    durationMs?: number | undefined;
    summary: string;
    tags?: readonly string[] | undefined;
    moments?: readonly {
      startMs: number;
      endMs: number;
      focusX: number;
      focusY: number;
      zoom: number;
      description: string;
    }[] | undefined;
  }[] | undefined;
}): string {
  const lines = i.words.map(([idx, ms, text]) => `${idx}@${(ms / 1000).toFixed(2)} ${text}`);
  const frames = i.frameTimesMs ?? [];
  const seen = i.noVideo
    ? '\nVOICEOVER ONLY (no speaker video): use layout "full" on EVERY scene. Never use "split", "card", "pip", "speaker", "punch", "cta", or "none" templates — every beat must be a visually arresting full-frame graphic or uploaded clip (lean heavily on uploaded Media Bin clips when provided, plus concrete "image" illustrations/photos, "logo"/"logos", "website", "chart", "flow", "compare", and "counter" — keep pure text cards under 30% so it feels like a Vox/editorial visual essay, not slides).'
    : frames.length
      ? `\nKeyframes attached: ${frames.length} images, in order, taken at ${frames
          .map((ms, k) => `#${k} ${(ms / 1000).toFixed(1)} s`)
          .join(', ')}.`
      : '\nNo keyframes attached: assume a talking head centred in the frame (faces: []).';
  const defaultLayout = i.noVideo ? 'full' : i.look === 'mono' ? 'split' : 'card';
  const craftBlock = i.brief
    ? `\n\n${styleCraftDirection({ styleId: i.brief.style, customStyle: i.brief.notes })}\n\n${recipeBlock(i.brief)}`
    : '';
  const mediaBlock = i.mediaBin?.length
    ? `\n\nUPLOADED MEDIA BIN (${i.mediaBin.length} creator ${i.mediaBin.length === 1 ? 'clip' : 'clips'} — weave these into matching beats with template "clip" using exact clipId! Prefer real uploaded footage over stock/text wherever it matches what the speaker says):\n${i.mediaBin
        .map((c) => {
          const dur = c.durationMs ? `${(c.durationMs / 1000).toFixed(1)}s` : 'still';
          const tags = c.tags?.length ? ` [${c.tags.join(', ')}]` : '';
          const moments = c.moments?.length
            ? ` · moments: ${c.moments
                .slice(0, 3)
                .map(
                  (m) =>
                    `[startMs=${m.startMs} focus=(${m.focusX.toFixed(2)},${m.focusY.toFixed(2)}) zoom=${m.zoom.toFixed(2)}: ${m.description}]`,
                )
                .join('; ')}`
            : '';
          return `- clipId="${c.id}" (${c.kind}, ${dur}, "${c.name}"): ${c.summary}${tags}${moments}`;
        })
        .join('\n')}`
    : '';
  return `Look: ${i.look} (default layout: ${defaultLayout}).
Duration: ${(i.durationMs / 1000).toFixed(1)} s.${seen}
Words: ${i.words.length} (index@seconds word):
${lines.join('\n')}${mediaBlock}${craftBlock}

Write the story, then plan the reel.`;
}
