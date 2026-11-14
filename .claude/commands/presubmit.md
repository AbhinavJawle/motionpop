Run the pre-submission audit.

1. `pnpm typecheck && pnpm lint && pnpm test` (and `pnpm e2e` if the app is running).
2. Secret scan (gitleaks or grep for key patterns). Confirm `.env*` (except .env.example) are untracked.
3. Confirm `.kiro/` is committed and not in `.gitignore`.
4. Grep UI copy, style names, demo content and docs for third-party brand or creator names; list any hits.
5. Check README sections (value proposition, features, architecture, how AI is used, run instructions, third-party link) and LICENSE.
6. Walk through `docs/submission-checklist.md` and report each item as done / missing.
