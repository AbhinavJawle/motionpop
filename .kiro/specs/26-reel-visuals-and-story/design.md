# Spec 26: design

## Data
- `ReelMedia = { kind: 'logo' | 'photo' | 'illustration' | 'screenshot', query, asset? }`. `query` is what to fetch (brand name, domain, subject). `asset` is the id of a `project.assets` entry once resolved.
- New templates in `ReelTemplateSchema`: `logo { media, name, sub? }`, `logos { title?, items[{at, media, name}] 2–6 }`, `image { media, fit: frame|bleed, kicker?, title?, words[{at,text}] }`, `website { media, url, headline?, strikeAt? }`.
- `media?` on list/stack/flow items and `leftMedia?/rightMedia?` on compare.
- `ReelScene.carry?: boolean`.
- `ImageAsset.source` gains `logo`, `stock`, `screenshot`.
- `ReelData.images?: Record<assetId, {src, w, h}>`; templates read pictures through `ctx.img(media)`.

## Director v2 (`reel.direct`, prompt v2)
Output: `{ hook, story { topic, arc, motif }, scenes[ { fromWord, toWord, layout, beat, carry?, tag?, graphic } ] }`, where `graphic` is an `anyOf` of one object per template with its fields required. The model answers in word indices. `toReelPlan` maps them to ms cues and turns media requests into `ReelMedia` with no asset yet.

## Media resolution (`resolveReelMedia`)
After directing, each unresolved `ReelMedia` is fetched in turn:
- logo → `/api/reel/logo?q=` (server: icon set CDN by slug, then the site's own icon), rasterised to webp;
- photo → existing `/api/media/stock`;
- illustration → `generateImageWithFirebase` with the look's recipe (credits);
- screenshot → render service `/screenshot` (headless Chrome).

Results are stored like any image asset (`media:{hash}.webp`), and the scene's `media.asset` is set. A failure leaves `asset` unset, and the template draws its fallback.

## Engine
- `image`: frame mode is a rounded card with a soft shadow and a slow Ken Burns (scale 1.06→1.0, drift). Bleed mode fills the panel with a gradient scrim. Kinetic words reveal on cue over the picture.
- `logo`: the tile pops in with a back-ease scale from 0.6, the name types in letter by letter, and a soft ring pulses once.
- `logos`: tiles in a centred row or grid, each popping on its word.
- `website`: browser chrome with the screenshot inside. It scrolls slowly after the entrance, and an optional red strike draws in on cue.
- Items with a logo draw a rounded logo tile where the icon would be.
- `carry`: a scene whose `carry` is true skips the panel entrance. Items cued before the scene start render fully revealed.
- `mount` waits for all `<img>` to decode inside `ready`.

## Sound (`reelSfx(plan) → BedSfx[]`)
A pure function of the plan:
- whoosh at each graphic scene start (not on carry);
- tick at each list/stack/checklist/flow/terminal item cue (−8 dB, min gap 140 ms);
- pop at logo tiles and the CTA;
- rise ending at a counter's land, then impact;
- impact on punch.

`mixBed` turns it into a WAV. Export: `run-render` writes `assets/bed.wav` and passes `sfxSrc`. Preview: the same WAV is generated client-side and played in sync with the editor clock.

## Testing
- Schema property: random plans with media stay valid.
- Director: `toReelPlan` maps media, carry and per-template objects.
- Engine sheet via `reel-dev.ts` with local assets.
- `reelSfx` is deterministic, with events inside the duration and spacing rules held.
- Render test for reel images and bed.
