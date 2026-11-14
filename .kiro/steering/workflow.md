---
inclusion: always
---

# Workflow: spec-driven development

1. **Steering first.** Rules live in `.kiro/steering/`. When a decision changes, update steering and log it in `docs/decisions.md`.
2. **One spec per feature** in `.kiro/specs/NN-feature/`:
   - `requirements.md`: user stories + acceptance criteria in EARS ("WHEN … THE SYSTEM SHALL …"), numbered (R1.1, R1.2…).
   - `design.md`: architecture, data flow, interfaces, schemas, edge cases, testing approach, correctness properties.
   - `tasks.md`: small, ordered, checkable tasks, each referencing requirement IDs.
3. **One task at a time.** Implement, test, check the box, commit.
4. **Definition of done:** typecheck + lint + tests green; motion components pass `pnpm motion:check <id>`; UI matches the design screenshot; no secrets.
5. **Spikes** are fine for exploration; record the result in `docs/decisions.md`.
6. **Spec order** (demo path first, see `docs/plan.md` §5): 00 walking skeleton → 01 foundation → 02 design system + Pip → 03 motion engine → 04 editor shell + timeline → 05 audio pipeline → 06 slot detection + auto-fill → 07 components + style packs → 08 render + export → 09 inspector, quick edits, notes → 10 Pip panel → 11 dashboard/start/recording → 12 formats/captions/sound → 13 credits/judge/settings → 14 styles + director skills → 15 tier-2 custom → 16 landing/share/brand.

## Tools (honest split)
- **Claude Code** drives planning, architecture and most implementation. It reads the same steering through `CLAUDE.md`.
- **Kiro CLI** executes real spec tasks headlessly with the custom agents in `.kiro/agents/` (target ≥ 25 % of tasks), reviews specs against steering, and runs motion QA.
- Every Claude Code session is logged in `DEV_LOG.md`; every Kiro run in `KIRO_LOG.md`, written from the run's own output. Never fabricate or back-date Kiro usage.

## Commits
Conventional commits, small and frequent, referencing the spec task (`feat(06-slot-detection): task 4 post-pass`). Push at least daily.

## Session start
Read the last DEV_LOG / KIRO_LOG entry, open the current spec's `tasks.md`, pick the next unchecked task.
