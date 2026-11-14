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
- **As built (task 5):** auth state lives in a module store read with `useSyncExternalStore` (`lib/auth/auth-store.ts`; `loading` on the server, `local` when Firebase isn't configured, so tests and offline dev open every route). `safeNextPath` only accepts same-origin paths (property-tested against `new URL`). Password reset answers the same whether or not the account exists. Playwright runs the editor specs in local mode and `e2e/auth.spec.ts` against the Auth emulator.
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

**As built (task 3, 2026-11-14):** `lib/firebase/config.ts` parses the `NEXT_PUBLIC_*` env with zod (missing config → local-only mode, no crash; the debug token is ignored outside development). `lib/firebase/client.ts` exposes memoised async getters (`getFirebaseApp`, `getAppCheckClient`, `getAuthClient`, `getDb`, `getStorageClient`, `getRemoteConfigClient`, `getAILogic`) that import each service on demand, connect to the emulators when `NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true`, and use `AgentPlatformBackend('global')` with limited-use App Check tokens (D-025). `lib/firebase/remote-config.ts` returns `{ config, source }` and falls back to the typed defaults. `/dev/firebase` is a dev-only smoke test (App Check token, Remote Config, Auth, Firestore reachability, one AI call). Project setup done from the CLI: Firestore `(default)` and the Storage bucket in us-central1, email/password auth, `localhost` authorised, reCAPTCHA Enterprise key registered with App Check, App Check enforced on AI Logic, Firestore and Storage. Google sign-in needs a support email, so it is enabled in the console.

## User bootstrap (server)
`POST /api/users/bootstrap` with `Authorization: Bearer <idToken>` and `X-Firebase-AppCheck`:
1. Verify both tokens.
2. Transaction: if `users/{uid}` doesn't exist → create `{ displayName, email, plan, credits, settings, schemaVersion: 1, createdAt }` and `users/{uid}/credits/{txId} = { delta, reason: "signup" | "judge-grant", balanceAfter }`.
3. Judge allow-list: `JUDGE_EMAILS` secret (comma-separated), never in the repo.
4. Idempotent: calling twice changes nothing.

**As built (task 6):** `planBootstrap` (pure, `lib/users/bootstrap-plan.ts`) decides the doc and the first ledger entry; the judge plan needs a **verified** email on the allow-list, since anyone can type a judge's address into email/password sign-up. `bootstrapUser` runs one transaction that creates `users/{uid}` and `users/{uid}/credits/signup` (fixed id, so concurrent calls can't grant twice) or only touches `lastSeenAt`. Grants come from the Remote Config server template (`serverConfig`, 5-minute cache, typed defaults). `verifyRequest` checks the ID token and the App Check token; App Check is skipped only for emulator runs outside production. The client calls the route once per user per page load from the auth store. Admin uses Application Default Credentials (`gcloud auth application-default login` locally, the App Hosting service account in production).

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
  models: { fast: "gemini-3.5-flash-lite", strong: "gemini-3.8-flash", tts: "gemini-3.8-flash-tts" } }
```
Remote Config keys are flat; values arrive as strings (numbers and booleans as text, objects as JSON):

| Key | Type | Default |
|---|---|---|
| `routing_slots_detect_device_max_words` | int ≥ 0 | 400 |
| `routing_overrides` | JSON object `{ [taskId]: InferenceMode }` | `{}` |
| `flag_tier2` | boolean | false |
| `flag_auto_fill` | boolean | true |
| `free_credits` | int ≥ 0 | 20 |
| `judge_credits` | int ≥ 0 | 500 |
| `daily_budget_credits` | int ≥ 0 | 20000 |
| `kill_switch` | boolean | false |
| `custom_provider` | `"gemini" \| "claude"` | `"gemini"` |
| `model_fast` / `model_strong` / `model_tts` | non-empty string | `gemini-3.5-flash-lite` / `gemini-3.8-flash` / `gemini-3.8-flash-tts` (D-026) |

`InferenceMode` values: `PREFER_ON_DEVICE`, `ONLY_ON_DEVICE`, `PREFER_IN_CLOUD`, `ONLY_IN_CLOUD`.

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
