# Kiro log

How Kiro was used to build Motionpop. Each entry points to evidence in the repo.

### 2026-11-12: Restarted the foundation through Kiro steering and specs
- Kiro feature: steering (four inclusion modes), Quick Spec
- What it did: Replaced the first vibe-coded scaffold, which didn't type-check (TS5095) and used Turborepo 1 config, with a spec-driven one. Steering is split by inclusion mode so only relevant rules load: `always` (product, tech, structure, kiro-log), `fileMatch` (motion principles, component contract, skill format, style-pack format, design system), `auto` (security-and-cost), `manual` (`#full-spec`, which pulls `docs/KIRO_CONTEXT.md` and `docs/product-spec.md` in through `#[[file:]]`).
- Evidence: `.kiro/steering/`, `.kiro/specs/monorepo-scaffold/`, `docs/drafts/` (the earlier drafts, kept as input for later specs)

### 2026-11-12: Property test caught a float bug in the first helper
- Kiro feature: spec-linked tests (Req 5.3 of `monorepo-scaffold`)
- What it did: The safe-area test failed because `1 - 0.05 - 0.05` evaluates to `0.8999…`, so the YouTube safe area was 1727.9999 px wide. `getSafeArea` now rounds insets to whole pixels, and the property test checks that the safe area stays inside the frame for arbitrary insets.
- Evidence: `packages/schemas/src/formats.ts`, `packages/schemas/src/formats.property.test.ts`

### 2026-11-12: Spec #1 render-pipeline drafted (requirements + design)
- Kiro feature: feature spec (EARS requirements, design with decision table)
- What it did: Defined the scene-spec JSON contract, the Number Reveal component, the Player preview and the local + Lambda export targets. The design chose server rendering over Remotion's client-side renderer, because the client-side renderer emulates CSS on a canvas.
- Evidence: `.kiro/specs/render-pipeline/requirements.md`, `.kiro/specs/render-pipeline/design.md`
