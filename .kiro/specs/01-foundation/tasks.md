# Tasks: 01 foundation

Tasks marked **[kiro]** are executed by Kiro CLI and logged in `KIRO_LOG.md`.

- [x] 1. Workspace: `services/*` in `pnpm-workspace.yaml`, package skeletons, shared tsconfig/eslint, root vitest workspace; `pnpm typecheck/lint/test` green. — R1
- [x] 2. Next 16 app scaffold + Tailwind 4 + shadcn init; `globals.css` tokens from `design-system.md`; Geist fonts; dark only. — R2
- [x] 3. Firebase client init + App Check (debug token locally) + lazy getters; `.env.example`. _(needs the Firebase project)_ — R3.1–R3.3, R6.2
- [x] 4. **[kiro]** Remote Config typed defaults with zod + unit tests: `packages/schemas/src/config.ts` exports `AppConfigSchema`, `APP_CONFIG_DEFAULTS` and `parseRemoteConfig(raw: Record<string, string>) → AppConfig`. Remote Config stores flat string values (keys in design.md); each bad or missing key falls back to its own default without failing the others. Pure, no Firebase project needed (the fetch wiring is task 3). — R3.4
- [x] 5. Auth: AuthProvider, Google + email/password helpers, `AuthGate`, sign-in page (functional; visual polish in spec 02). — R4.1, R4.2
- [x] 6. Server: Admin SDK, token verification helpers, `POST /api/users/bootstrap` with 20 credits + ledger + judge allow-list. — R4.3–R4.5
- [x] 7. **[kiro]** `firestore.rules` + `storage.rules` + rules tests on the emulator. — R5
- [x] 8. **[kiro]** Property test: bootstrap idempotent under concurrent calls (emulator). — R4.3
- [x] 9. CI: pnpm 11 / Node 24, lint, typecheck, tests, gitleaks, rules-test job. — R6
- [x] 10. App Hosting backend + `apphosting.yaml` + first deploy; confirm App Check on the hosted URL. — R7
