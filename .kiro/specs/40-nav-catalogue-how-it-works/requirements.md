# Requirements — Spec 40: Unified Film-Strip Navbar, Categorised Styles, Recipes, Skills & Technical How It Works

## R1 — Persistent black film-strip navbar outside the editor
- **R1.1:** Every non-editor screen (`/dashboard`, `/styles`, `/recipes`, `/skills`, `/how-it-works`, `/start`, `/start/record`, `/start/script`, `/start/configure`, `/processing/[id]`, `/settings`, `/terms`, `/privacy`, `/share/[id]`) SHALL render the black film-strip top bar (`AppBar` / `paper.bar`), never switching to a plain white top bar.
- **R1.2:** Project-creation screens (`/start`, `/start/record`, `/start/script`, `/start/configure`) SHALL keep their draft controls (`← Home`, editable title, `16:9 / 9:16 / 1:1` format switcher, `Help`) in a slim secondary paper sub-bar directly underneath `AppBar`.
- **R1.3:** `AppBar` SHALL expose five top-level tabs for signed-in creators: `Projects` (`/dashboard`), `Styles` (`/styles`), `Recipes` (`/recipes`), `Skills` (`/skills`), and `How it works` (`/how-it-works`). For signed-out visitors on public pages such as `/how-it-works`, `AppBar` SHALL show `How it works` and a `Sign in` button.

## R2 — Categorised Styles gallery (`/styles`)
- **R2.1:** `/styles` SHALL separate styles into two explicit categories: **Reel styles** (talking-head 9:16 styles from `builtInSkills.recipes()`) and **Motion graphic looks** (voiceover/script looks from `styleOptions()`).
- **R2.2:** Users SHALL be able to view all categories together or filter by `Reel styles` or `Motion graphic looks`.
- **R2.3:** Clicking a Reel style SHALL preselect both its parent recipe and style on `/start` (`/start?recipe=<id>&style=<id>`); clicking a Motion graphic look SHALL preselect its look (`/start?style=<id>`).

## R3 — Recipes catalogue (`/recipes`)
- **R3.1:** `/recipes` SHALL render every built-in recipe from `builtInSkills.recipes()` plus the custom `"Describe your own"` recipe mode.
- **R3.2:** Each recipe card SHALL explain its pacing (`sceneMs`), layout mix (`split`/`card`/`full`/`speaker`), hook pattern, visual grammar, preferred reel templates, soundtrack brief, SFX density, banned tropes, curated reel styles, default voiceover look, its source director-skill file (`skills/recipes/<id>.md`), and which motion-graphic slot skills (`skills/*.md`) pair with it, linking directly to `/skills`.

## R4 — Skills catalogue (`/skills`)
- **R4.1:** `/skills` SHALL display every skill currently in the codebase registry: all 5 Reel Director Skills (`skills/recipes/*.md`) and all 8 Motion-Graphic Slot Skills (`skills/*.md`).
- **R4.2:** Each motion-graphic slot skill SHALL show its `useWhen`, compatible scenes (`detectWorksWith`), energy level, default duration, a visual share-of-duration shot-sequence bar parsed from `SLOT_SEQUENCES`, camera move, emphasis, sound cues, voice sync, rules, and anti-patterns.
- **R4.3:** `/skills` SHALL honestly document where skills currently live (versioned Markdown + `@motionpop/ai` registries, not a live Firestore collection yet) and the exact steps to add a new skill.

## R5 — Public technical "How it works" route (`/how-it-works`)
- **R5.1:** The marketing landing page SHALL remove the `#how` ("One take. Three beats.") navigation anchor and route `How it works` directly to `/how-it-works`.
- **R5.2:** `/how-it-works` SHALL be publicly accessible without sign-in so hackathon judges can inspect the full architecture.
- **R5.3:** `/how-it-works` SHALL feature on-device **Gemini Nano** (via Firebase AI Logic) prominently in the opening sections, including a live browser availability probe (`useAIStatusStore`), exact Chrome setup requirements, and which tasks run free/offline on-device vs. in the cloud.
- **R5.4:** `/how-it-works` SHALL include custom vector architecture diagrams matching the Paper aesthetic covering: (a) Hybrid AI routing, (b) full Frankenstein system infrastructure, (c) end-to-end voice/video pipeline, and (d) deterministic `hf-seek` HyperFrames preview/export parity.
- **R5.5:** All model names, credit costs, template counts, and skill counts shown on `/how-it-works` SHALL be sourced from `@motionpop/schemas` and `@motionpop/ai` (no fabricated numbers or drifted constants).
