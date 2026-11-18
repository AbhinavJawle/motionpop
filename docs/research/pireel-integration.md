# Pireel + Motionpop: comparison and integration design

Written in a Claude Code session (2026-11-18) after reading both codebases. Pireel was read at commit `51fb487` (2026-11-16), cloned to `~/Developer/ref/pireel`; it has not been run yet. The founder approved bringing in Pireel, including its GSAP runtime and AGPL-3.0 licence (D-076).

## 1. The two codebases side by side

| | Motionpop (ours) | Pireel |
|---|---|---|
| Size | ~110k lines TS, 1 week old | ~167k lines TS (`studio-engine` 65k, `studio-ui` 91k) |
| App | Next.js 16 App Router, deployed on App Hosting | Vite + React 19 workbench, embeddable as `<PireelEditor>` |
| What a project is | One voiceover (cleaned WAV, original kept) + word transcript + **slots** (non-overlapping, word-ranged) with component params | `EditorDocumentV2`: a multi-track timeline (narrative, B-roll, graphics, audio, captions), assets, transcripts per asset, scenes |
| Time | Integer ms, cleaned-audio clock | Integer frames on the timeline, float seconds into sources |
| Cuts | Fillers and pauses become an EDL; the audio is **re-rendered** (destructive, original kept); words re-timed | **Non-destructive**: narrative clips carry `sourceInSec/sourceOutSec`; ripple edits move everything after |
| Graphics follow speech | Slots hold `wordStart/wordEnd`; cleanup re-times words | Graphic and caption clips have a **word anchor** (`{assetId, segmentIndex, wordIndex, offsetFrames}`), so they follow the speech through any ripple edit |
| Graphics engine | Our deterministic core (no GSAP), 11 scenes, custom tier-2, film beats; compiled into a HyperFrames composition, `hf-seek` | Blocks = HTML + one `<style>` + a GSAP timeline body on a paused `tl`, assembled into a HyperFrames document with `gsap.min.js` |
| Generation | `packages/ai` router: device (Nano) vs cloud, zod, repair, cost | Never calls a model itself. The host fills `StudioProviders` (composer, transcriber, cleanup, highlights, titles, edit plan, chat…) |
| Video | None | Import, trims, B-roll, picture-in-picture layouts (inset, presenter, split), punch-ins, transitions, framing, person matte (MediaPipe), denoise (RNNoise) |
| Captions | 3 presets, burned in | Managed caption track derived from the transcript, word highlights, effects, translation, many presets |
| Export | Cloud Run HyperFrames producer (Chrome renders every frame; canvas and WebGL work) | **In the browser**: WebCodecs via mediabunny; graphic blocks are snapshotted per frame via SVG `foreignObject` (canvas content is not captured), plus a Premiere/Resolve timeline export |
| AI chat | Pip panel: whole-video plans as one undoable command | AI chat (Vercel AI SDK) with editing tools; external agents over MCP |
| Persistence | Firestore + IndexedDB, Storage | `ProjectStore` (transactions), `MediaVault` (content-addressed), OPFS cache |
| Licence | Apache-2.0 → AGPL-3.0 with this change | AGPL-3.0-only (agent connector Apache-2.0) |

## 2. What each side is good at

**Pireel** is a mature talking-head editor: the timeline, the cuts, the captions, B-roll, layouts and export are done, and done carefully (its comments record real bugs fixed). Its weak spot for us: graphics are small GSAP fragments over footage, and its export can't capture canvas or WebGL.

**Motionpop** has the pieces Pireel leaves to the host: on-device transcription (Whisper), filler and pause cleanup, slot detection with reasons, the device-vs-cloud router with Nano, TTS from a script, Firebase accounts, credits and storage, a Cloud Run renderer that captures anything Chrome can draw, and a whole-film generator (raw Carbon and Hydrogen films, `docs/research/film-mode-test.md`).

## 3. The integration: Pireel is the editing surface, Motionpop is everything around and under it

```
Start (record / upload voice or VIDEO / paste script → TTS)          [ours]
  → Processing: Whisper on device, cleanup, slot detection           [ours]
  → bridge: Motionpop project → EditorDocumentV2                     [new]
      narrative clip(s) per kept segment (non-destructive cuts)
      a graphic clip per slot, word-anchored to the slot's first word
      managed captions from the transcript
  → <PireelEditor providers={motionpopProviders}>                    [Pireel]
      composer        → packages/ai (cloud, credited)
      transcriber     → our Whisper worker (device, free)
      speechCleanup   → our EDL + Nano for retakes (device)
      autoHighlight, draftInsertPrompt, syncFill, translate → Nano (device, free, offline)
      brandTitles, editPlan, chat → Gemini cloud
      projects / vault / uploads → Firestore + Storage (local-only first)
  → export: Pireel's browser export; our Cloud Run render when a graphic uses canvas or WebGL
```

**Why this is "in sync, not separate":** one document holds the footage, the voice, the captions and our graphics. Our graphics become word-anchored graphic clips, so a cut, a retake removal or a trim moves them with the words, through Pireel's own ripple logic, with no second timeline to keep in step.

**Our graphics inside Pireel blocks (the bridge):**
- `assembleHtml` loads `gsap.min.js` in one place (`packages/studio-engine/src/assemble.ts`, the `<script src=gsapSrc>` line). We add our motion runtime bundle right after it.
- A new runtime entry, `mountBlock(el, { componentId, params, words, style, format, durationMs }) → { seek(ms) }`, runs one of our components inside a block's element. It is built on `createEngine` with a one-slot project.
- The block's GSAP body is a proxy tween: `tl.to(p, { t: D, duration: D/1000, ease: 'none', onUpdate: () => mp.seek(p.t) }, 0)`. Pireel's timeline drives our pure `seek(t)`. Nothing of ours depends on GSAP.
- So the scene engine, custom graphics and film beats all work as Pireel graphics. Whole films (the raw approach) become a full-frame graphic clip over the voice, or the video when there is one.

## 4. What we learn from Pireel's motion graphics (and apply to our generators)

From `prompts/block-system.ts`, `prompts/motion-graphic-patterns.ts`, `graphic-fit.ts`, `director-plan.ts`:

1. **The surface follows the backdrop.** On live footage, set type straight on the picture (heavy ink, a text-shadow or an accent slab as the legibility net), no filled card. A card only for dense data. On a flat page, compose like a magazine page.
2. **Layout archetypes, chosen for the content, varied between neighbours:** hero-metric (with a ghost numeral), split-editorial, stacked-rows, chart-forward, poster-type, full-field argument, annotated, badge-verdict. Rotate alignment too; seven centred cards read as one template.
3. **Spoken-beat reveals:** every spoken item appears on the beat that first names it; nothing later is visible early; later beats re-emphasise; no loops.
4. **Staged entrance:** surface → frame (rules and kicker draw) → structure (rows stagger) → hero lands last and hardest. About 1.2 s, then hold.
5. **Editable output:** every visible text gets a `data-edit` key, so the user fixes wording in place without regenerating. Every image is a real `<img>` (click to replace). Each graphic declares 2–6 tunable properties as a JSON schema. This beats our "regenerate to change a word".
6. **Draw symbols, never type them:** arrows, ticks and stars as SVG, since glyphs differ between the browser and the render machine. Icons come from Lucide through a tool, never freehand, never emoji.
7. **Colour discipline:** tokens only; a border uses a different token from its surface ("border = background" bug); one accent on the focal mark; size contrast of at least 3× between hero and labels.
8. **Program-side fitting (`graphic-fit.ts`):** after render, measure ink, paint and the smallest text, then make the smallest similarity transform that keeps text readable and off the face (MediaPipe) and the caption band, before anyone regenerates.
9. **Pattern retrieval:** an open capability map plus recipes retrieved only for the current moment (comparison, before/after, process…), instead of one fixed catalogue in every prompt. That's the same lesson as our raw film test: less fixed context, better output.
10. **A self-check list at the end of the prompt** that the model applies silently before answering.

Where we are already ahead: whole-film direction (one world, carriers, seams), real maps with Natural Earth data, and the Cloud Run renderer for canvas and WebGL.

## 5. Risks and unknowns
- **Not run yet.** Installing Pireel runs third-party install scripts and needs the founder's go (`corepack pnpm@9.12.0 install` in `~/Developer/ref/pireel`).
- **Toolchain:** Pireel targets Vite, TypeScript 5.5 and pnpm 9; we run Next.js 16, TypeScript 6 and pnpm 11. Its packages are TypeScript source consumed through workspace exports, so `transpilePackages` in Next should work. To be confirmed by the first embed.
- **Client-only:** the editor uses OPFS, WebCodecs and workers. It mounts in a client component with SSR off.
- **Two design languages:** Pireel's workbench has its own look. Our design PNGs keep covering dashboard, start and processing; the editor takes Pireel's UI with our theme tokens on top.
- **Export of canvas and WebGL graphics:** Pireel's browser export skips canvas. Our maps and raw films need the Cloud Run path for those clips.
- **What the open version leaves out:** the hosted Pireel has dubbing, B-roll search, erasure and playbooks as connected workflows. The open version has the editor and the interfaces. We fill what we need through the providers.
- **Hybrid AI must stay visible:** the route chips (`⚡ free · on-device`, `☁ N`) need a place in Pireel's UI (the `extensions` prop) or the #BuildHybridAI story gets lost.
