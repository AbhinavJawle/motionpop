# Instructions for AI coding agents (Claude Code and Kiro share these rules)

Project rules live in `.kiro/steering/`. The `inclusion: always` files are imported below; read the `fileMatch` ones when touching matching paths (design-system, screens, editor-timeline, pip-mascot for `apps/web`; component-contract, component-library, motion-principles, style-pack-format for `packages/motion`; ai-tasks for `packages/ai`; data-model for schemas/rules; director-skill-format for `skills/`). Plan, scope and schedule: `docs/plan.md`. Decisions: `docs/decisions.md`.

@.kiro/steering/product.md
@.kiro/steering/tech.md
@.kiro/steering/architecture.md
@.kiro/steering/structure.md
@.kiro/steering/workflow.md
@.kiro/steering/testing.md
@.kiro/steering/security-and-cost.md
@.kiro/steering/hybrid-ai.md
@.kiro/steering/hackathon-compliance.md

**Visual source of truth:** `design/screens/*.png` and `design/figma-export.css`. Match them exactly. When a doc disagrees with the designs, the designs win.

## Workflow (spec-driven)
1. No feature work without a spec in `.kiro/specs/<NN-feature>/` (`requirements.md` in EARS, `design.md`, `tasks.md`).
2. Implement one task at a time, in small diffs. Check the box in `tasks.md` when done.
3. Every task ends with typecheck, lint and tests green. Motion components also pass `pnpm motion:check <id>`. UI tasks are compared against the design screenshot.
4. Commit often (conventional commits referencing the spec task, e.g. `feat(03-motion-engine): task 2 eases`).
5. Log every session honestly: Claude Code sessions → `DEV_LOG.md`, Kiro runs → `KIRO_LOG.md`. Never fabricate Kiro usage.

## Hard rules
- Never commit secrets. Env vars / Secret Manager only.
- No third-party brand names, creator names or trademarks in UI copy, style names, demo content or code.
- Never add `.kiro/` to `.gitignore`.
- Our motion components are deterministic pure functions of time and use no GSAP. HyperFrames is driven through `hf-seek`.
- All runtime AI goes through `packages/ai` (router, zod validation, cost tracking, Firebase AI Logic). No direct model calls from UI code.
- Every external input (AI output, uploads, Firestore reads) is parsed with zod.
- Time is stored as integer milliseconds. Frames are derived at render (30 fps).
- Verify fast-moving APIs (Firebase AI Logic, HyperFrames, transformers.js) against current docs before coding.
- TypeScript strict. No `any` without a comment explaining why.
- Don't run HyperFrames' telemetry beacon (`npx hyperframes events`).
