# Tasks — Spec 40: Unified Film-Strip Navbar, Categorised Styles, Recipes, Skills & Technical How It Works

- [x] 1. Wire optional `recipeId` on `StartDraftSchema`, `StartScreen`, `ConfigureScreen`, and `defaultEdit` so `/styles` and `/recipes` deep-links preselect both recipe and style cleanly.
- [x] 2. Keep the black film-strip `AppBar` consistent across all non-editor screens (`AppBar`, `ProjectTopBar` with slim draft sub-bar, `ProcessingScreen`, `LegalPage`, `ShareVideo`) and update landing nav/footer to route `How it works` to `/how-it-works` (removing the `#how` "One take. Three beats." section).
- [x] 3. Categorise `/styles` (`StylesGallery`) into **Reel styles** vs. **Motion graphic looks** with filter controls and recipe/style deep-links.
- [x] 4. Build `apps/web/lib/skills/catalog.ts` + sync test verifying parity with `skills/*.md` and `skills/recipes/*.md`.
- [x] 5. Build `/recipes` route and `RecipesPage` explaining every recipe, director skill parameters, layout mix, templates, music brief, banned tropes, curated styles, and paired slot skills.
- [x] 6. Build `/skills` route and `SkillsPage` showing all 5 Reel Director Skills and 8 Motion-Graphic Slot Skills (with share-of-duration bars) plus honest storage & authoring instructions.
- [x] 7. Build public `/how-it-works` route (`HowItWorksPage` + custom Paper SVG `diagrams.tsx`) covering on-device Gemini Nano (with live browser status probe), Frankenstein infrastructure, dual engines, AI routing & credit matrix, deterministic HyperFrames parity, audio/asset pipeline, skills/Kiro workflow, and security.
- [x] 8. Add unit/component tests, run typecheck, lint, Prettier, and Vitest across touched packages, and log honestly in `DEV_LOG.md`.
