Create a new spec for the feature: $ARGUMENTS

1. Read all files in `.kiro/steering/` and the matching draft in `docs/spec-drafts/` (if any).
2. Create `.kiro/specs/<NN-feature>/requirements.md` (user stories + EARS acceptance criteria), then STOP and show it to me for approval.
3. After approval, write `design.md` (architecture, data flow, interfaces, schemas, edge cases, testing approach incl. property tests). STOP for approval.
4. After approval, write `tasks.md`: small ordered checkbox tasks, each referencing requirement numbers. STOP.
Do not write implementation code in this command.
