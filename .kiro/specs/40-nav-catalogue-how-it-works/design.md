# Design — Spec 40: Unified Film-Strip Navbar, Categorised Styles, Recipes, Skills & Technical How It Works

## Visual Language (Zero Drift)
Every screen uses the Spec 35 Paper kit (`PaperPage`, `AppBar`, `paper.frame`, `paper.press`, `paper.raised`, `poster`, `btn`, `Sprockets`, `border-2 border-ink`, hard ink offset shadows, Pip-blue `#8DBCEB`, ember `#FF6A3D`, mint `#A7F3D0` for on-device AI, violet `#DDD6FE` for cloud AI). No new theme tokens or conflicting styles are introduced.

## Navigation & Routes
- `AppBar` (`apps/web/components/paper/app-bar.tsx`): sticky black film-strip bar with 5 tabs (`Projects`, `Styles`, `Recipes`, `Skills`, `How it works`). Signed-out visitors see `How it works` + `Sign in` and logo links to `/`.
- `ProjectTopBar` (`apps/web/components/start/project-top-bar.tsx`): renders `<AppBar />` followed by a slim `h-12` paper sub-bar (`← Home`, `ProjectTitle`, `SegmentedPills` format switcher, `Help` button + `HelpSheet`).
- `ProcessingScreen` & `LegalPage`: render `<AppBar />` instead of white headers.
- `ShareVideo`: uses `paper.bar` black film-strip header with PipMark + wordmark + flame CTA.
- Landing page (`apps/web/components/landing/copy.ts` & `landing.tsx`): `NAV` points `How it works` to `/how-it-works` using Next `<Link>`, and removes the `#how` ("One take. Three beats.") section.
- New routes:
  - `apps/web/app/(app)/recipes/page.tsx` → `RecipesPage`
  - `apps/web/app/(app)/skills/page.tsx` → `SkillsPage`
  - `apps/web/app/how-it-works/page.tsx` (public, outside `(app)`) → `HowItWorksPage`

## Draft Pre-selection (`?recipe=` & `?style=`)
- `StartDraftSchema` (`packages/schemas/src/start.ts`): adds optional `recipeId: RecipeIdSchema.optional()`.
- `StartScreen`: captures both `?recipe=` (validated against `RecipeIdSchema`) and `?style=` into `StartDraft`.
- `ConfigureScreen` + `defaultEdit` (`apps/web/lib/configure/defaults.ts`): honours `take.draft.recipeId` and honours a matching reel `styleId` when `kind === 'video'`.

## Skills & Recipes Registry Bridge (`apps/web/lib/skills/catalog.ts`)
- Pulls live data from `@motionpop/ai` (`builtInSkills.recipes()`, `SKILLS`, `SLOT_SEQUENCES`, `SCENES`, `detectWorksWith`) so Production builds (Firebase App Hosting) need no runtime filesystem access.
- Augments each `SkillEntry` with structured metadata (`name`, `energy`, `intent`, `camera`, `emphasis`, `soundCues`, `rules`, `antiPatterns`, `voiceSync`) and parses `SLOT_SEQUENCES` into structured percentage segments (`startPct`, `endPct`, `label`) for the share-of-duration bar.
- Maps each of the 5 Reel recipes to its paired motion-graphic slot skills.
- `apps/web/lib/skills/catalog.test.ts` parses every `skills/*.md` and `skills/recipes/*.md` file directly from disk and asserts 100% parity so documentation and UI cannot drift.

## Technical Diagrams (`apps/web/components/how-it-works/diagrams.tsx`)
Four responsive inline SVGs drawn in the exact Paper visual grammar (2px `#000` strokes, hard `#000` offset shadows, Geist Mono labels, Bebas Neue headers, mint fills for on-device Chrome/Nano/Whisper, violet fills for cloud Firebase AI Logic/Gemini/Cloud Run, Pip-blue for HyperFrames/deterministic motion, ember for user actions & credits):
1. `HybridRouterDiagram` — Chrome Gemini Nano vs. Cloud Gemini decision gate, Zod validation, repair loop, and deterministic fallback.
2. `FrankensteinStackDiagram` — 4-plane infrastructure map (Browser, Firebase, GCP Cloud Run/Vertex, Open Media & Data).
3. `PipelineFlowDiagram` — Dual-track end-to-end flow (Talking-Head Reel Engine v3 + Motion-Graphic / Film Engine).
4. `ParityDiagram` — Single compiled HyperFrames composition driving both `<hyperframes-player>` and Cloud Run `@hyperframes/producer` + FFmpeg via `hf-seek`.
