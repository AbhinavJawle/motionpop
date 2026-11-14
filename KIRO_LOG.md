# Kiro log

Every session where Kiro (IDE or CLI) did work on Motionpop. One entry per run, written from the run's own output. Claude Code sessions are in `DEV_LOG.md`.

Template:

```
## YYYY-MM-DD · Kiro CLI | Kiro IDE · agent: <name>
- Spec / task:
- Prompt (short):
- Outcome: (files changed, tests, accepted / reworked)
- Kiro features used: (steering, spec, hooks, MCP, powers, skills, custom agent, PBT)
- What helped / what didn't:
```

---

## Setup (2026-11-14, done from Claude Code)
- **Steering:** `.kiro/steering/`. **Specs:** `.kiro/specs/`. **Skills:** `.kiro/skills/`. **Custom agents:** `.kiro/agents/`. **MCP:** `.kiro/settings/mcp.json`.
- These files were written in a Claude Code session, following the approved plan (`docs/plan.md`). Kiro runs logged below use them.

<!-- kiro-session:sess_4e3423d6-fc1b-48c9-a0b6-074601518abd -->
### 2026-11-14 · Kiro CLI 3.1.0 (headless) · agent: motionpop-builder
- started: ~2026-11-14T15:35Z · last stop: 2026-11-14T15:38:42.887Z · session: sess_4e3423d6-fc1b-48c9-a0b6-074601518abd
- commits: `21d0511 feat(00-walking-skeleton): task 2 schemas for time, transcript, slot and ai`
- (The Stop hook first recorded "commits since start: none" because it took the start time from the first stop. Fixed right after: SessionStart now records the start time.)
<!-- /kiro-session:sess_4e3423d6-fc1b-48c9-a0b6-074601518abd -->
- **Spec / task:** 00-walking-skeleton, task 2 (`packages/schemas`: time, transcript, slot, ai).
- **Prompt (short):** "Implement spec 00 task 2 only … run typecheck, lint and test for @motionpop/schemas, check the box, commit locally."
- **Outcome:**
  - Added `time.ts` (FPS 30, branded `Ms`, `msToFrame` / `frameToMs`), `transcript.ts`, `slot.ts` (SlotSuggestion), `ai.ts` (JsonPatchOp limited to replace/add/remove, `runResultSchema`).
  - Tests: 8 passing, including fast-check properties for the frame round-trip (0..10⁶) and ms within one frame.
  - It ran Prettier, left my uncommitted `packages/motion` work out of its commit, and checked the task box.
  - Accepted as is after review in Claude Code.
- **Kiro features used:** custom agent (`motionpop-builder` with scoped permissions), steering (always + fileMatch), spec, hooks (SessionStart context, PostToolUse check, Stop log), property-based tests.
- **What helped / what didn't:**
  - The spec design and steering were enough for it to finish in one pass, with no questions.
  - Odd: its final message said it "didn't run the motionpop-builder agent" and suggested not logging the run as Kiro. It was launched with `kiro-cli chat --agent motionpop-builder`, so this is a genuine Kiro run; the model just didn't recognise the prompt as describing itself.
  - Fix: the builder prompt now says explicitly "you are running inside Kiro CLI".

