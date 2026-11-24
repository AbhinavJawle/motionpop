# Spec 43: Modular User & Database Skills — Tasks

- [x] 1. Add `UserSkillSchema`, `UserSkillRefSchema` in `packages/schemas/src/skill.ts`, wire optional `userSkill` on `EditConfigSchema` and `userSkillId` on `StartDraftSchema`, update `firestore.rules`.
- [x] 2. Implement `packages/ai/src/skills/user-skill.ts` (`parseSkillMarkdown`, `condenseSkillInstructions`, `toRawGithubCandidates`, `toUserSkillRef`, `EXAMPLE_SKILL_MARKDOWN`), wire `skillName` / `skillInstructions` into `packages/ai/src/reel/brief.ts` and `packages/ai/src/tasks/film.ts` + tests.
- [x] 3. Implement SSRF-safe `/api/skills/import` route and Firestore + localStorage reactive store (`apps/web/lib/skills/user-skills.ts`) + tests.
- [x] 4. Build `SkillImportModal` and integrate saved custom skills into `/skills`, `/recipes`, `/start`, `/start/configure`, `summary.ts`, and `apps/web/lib/film/film.ts`.
- [x] 5. Run full verification (`prettier`, `tsc --noEmit`, `eslint`, Vitest across `schemas`, `ai`, `web`) and log in `DEV_LOG.md`.
