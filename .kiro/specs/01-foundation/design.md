# Design: 01 foundation

## Workspace
- Root `package.json` scripts already exist (dev, build, typecheck, lint, test, format) and run through `turbo`. Add `services/*` to `pnpm-workspace.yaml`.
- Catalog versions in `pnpm-workspace.yaml` (TypeScript, zod, React, Vitest, fast-check); each package references `catalog:`.
- Packages are TypeScript source-first (`"exports": { ".": "./src/index.ts" }`) and consumed by Next via `transpilePackages`. `services/render` builds with `tsc`.
- Vitest per package; root `vitest.workspace.ts`. Playwright in `apps/web/e2e`.

## App shell
```
apps/web/
  app/layout.tsx            fonts (geist/font), <html class="dark">, Providers
  app/(auth)/sign-in/page.tsx
  app/(app)/layout.tsx      AuthGate (client) → redirect when signed out
  app/(app)/dashboard/page.tsx   placeholder until spec 11
  app/api/users/bootstrap/route.ts
  lib/firebase/client.ts    initializeApp + App Check + lazy getters
  lib/firebase/admin.server.ts   firebase-admin (ADC on App Hosting)
  lib/firebase/verify.server.ts  verifyIdToken + verifyAppCheck
  lib/remote-config.ts      zod schema + defaults + getter
  lib/auth/                 AuthProvider, useUser, signIn helpers
  styles/globals.css        @theme tokens
```
- Route protection is client-side (`AuthGate`) plus server-side checks in every API route. Firebase Auth has no session cookie by default; we don't add one in the MVP.

## Tokens
`globals.css` uses Tailwind 4 `@theme` with the exact values from `design-system.md` (colours, radii, shadows, gradients as custom utilities `bg-ember-grad`, `shadow-glass`, etc.). shadcn primitives are restyled with these tokens in spec 02.

## Firebase client
```ts
const app = initializeApp(config);
if (process.env.NEXT_PUBLIC_APPCHECK_DEBUG_TOKEN) self.FIREBASE_APPCHECK_DEBUG_TOKEN = process.env.NEXT_PUBLIC_APPCHECK_DEBUG_TOKEN;
initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(siteKey), isTokenAutoRefreshEnabled: true });
```
Client init runs only in the browser (guard `typeof window`).

## User bootstrap (server)
`POST /api/users/bootstrap` with `Authorization: Bearer <idToken>` and `X-Firebase-AppCheck`:
1. Verify both tokens.
2. Transaction: if `users/{uid}` doesn't exist → create `{ displayName, email, plan, credits, settings, schemaVersion: 1, createdAt }` and `users/{uid}/credits/{txId} = { delta, reason: "signup" | "judge-grant", balanceAfter }`.
3. Judge allow-list: `JUDGE_EMAILS` secret (comma-separated), never in the repo.
4. Idempotent: calling twice changes nothing.

## Rules (sketch, full files in repo root)
```
function isOwner(uid) { return request.auth != null && request.auth.uid == uid; }
match /users/{uid} { allow read: if isOwner(uid); allow update: if isOwner(uid) && !request.resource.data.diff(resource.data).affectedKeys().hasAny(['credits','plan']); allow create, delete: if false; }
match /users/{uid}/credits/{tx} { allow read: if isOwner(uid); allow write: if false; }
match /users/{uid}/usage/{e} { allow read: if isOwner(uid); allow write: if false; }
match /users/{uid}/{sub}/{doc} { allow read, write: if isOwner(uid); }   // styles, brandKits
match /projects/{pid} { allow create: if request.resource.data.ownerId == request.auth.uid; allow read, update, delete: if resource.data.ownerId == request.auth.uid; }
match /projects/{pid}/{sub=**} { allow read, write: if get(/databases/$(database)/documents/projects/$(pid)).data.ownerId == request.auth.uid; }
match /renders/{rid} { allow read: if resource.data.ownerId == request.auth.uid; allow write: if false; }
match /shares/{sid} { allow read, write: if false; }
```
Storage: `users/{uid}/**` owner-only; audio ≤ 50 MB `audio/.*`; images ≤ 10 MB `image/.*`; renders written only by the service account.

## Remote Config defaults
```ts
{ routing: { "slots.detect.deviceMaxWords": 400 }, flags: { tier2: false, autoFill: true },
  judgeCredits: 500, freeCredits: 20, dailyBudgetCredits: 20000, customProvider: "gemini",
  models: { fast: "gemini-3.5-flash-lite", strong: "<set in console>", tts: "gemini-3.1-flash-tts-preview" } }
```

## CI
`.github/workflows/ci.yml` (exists): update to pnpm 11 + Node 24, add `pnpm typecheck`, `pnpm lint`, `pnpm test`, gitleaks action. Rules tests run in a separate job with the Firebase emulator.

## Deploy
`apphosting.yaml` in `apps/web` (region us-central1, env from Secret Manager: `JUDGE_EMAILS`, later `ANTHROPIC_API_KEY`). Backend created with `firebase apphosting:backends:create` once the project exists.

## Testing
- Unit: Remote Config parsing (bad values fall back to defaults).
- Rules tests: owner can read/write own project; other user can't; client can't change credits or plan; uploads over the limit are rejected.
- Property **[kiro]**: bootstrap is idempotent under repeated/concurrent calls (emulator).
- E2E smoke: `/sign-in` renders; signed-out `/dashboard` redirects.

## Correctness properties
1. A client can never raise its own credits.
2. Bootstrap runs at most once per user.
