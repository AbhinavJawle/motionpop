Implement the next task of spec: $ARGUMENTS

1. Read `.kiro/steering/` (relevant files) and `.kiro/specs/$ARGUMENTS/{requirements,design,tasks}.md`.
2. Pick the FIRST unchecked task in tasks.md. Tell me which one in one line.
3. Implement only that task with a small diff. Follow component-contract.md, motion-principles.md and design-system.md where relevant.
4. Run typecheck, lint and tests (and `pnpm motion:check <id>` for motion components). Fix failures.
5. Check the box in tasks.md, add a one-line note under the task if something was learned or changed.
6. Suggest a conventional commit message. Do not start the next task.
