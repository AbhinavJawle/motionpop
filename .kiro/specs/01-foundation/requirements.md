# Requirements: 01 foundation

## Introduction
The monorepo, the Next.js app with the Figma tokens and fonts, Firebase (App Check, Auth with Google + email/password, Firestore, Storage, Remote Config, AI Logic), owner-only rules, the server-side user bootstrap with starter credits, CI and the first App Hosting deploy. Lands by **Mon Nov 16, 2026**.

## R1 Workspace
**User story:** As the developer, I want one monorepo with the agreed stack, so features can be built fast and consistently.
1. THE SYSTEM SHALL be a pnpm workspace with `apps/web`, `packages/schemas`, `packages/motion`, `packages/ai` and `services/render`, run through Turborepo.
2. THE SYSTEM SHALL share one strict `tsconfig.base.json` (`strict`, `noUncheckedIndexedAccess`) and one ESLint + Prettier config.
3. WHEN `pnpm typecheck`, `pnpm lint` or `pnpm test` runs at the root THE SYSTEM SHALL run it for every package.

## R2 App shell with design tokens
1. THE SYSTEM SHALL use Next.js 16 (App Router), React 19, Tailwind CSS 4 and shadcn/ui.
2. THE SYSTEM SHALL define every token from `design-system.md` as CSS variables and Tailwind theme values in `apps/web/styles/globals.css`.
3. THE SYSTEM SHALL load Geist and Geist Mono locally (no runtime font CDN).
4. THE SYSTEM SHALL render the app on `bg` #08080C with `text` #F4F3F8 in dark mode only.

## R3 Firebase client and App Check
1. THE SYSTEM SHALL initialise Firebase from `NEXT_PUBLIC_FIREBASE_*` env vars and App Check (reCAPTCHA Enterprise) before any other Firebase call.
2. WHERE the app runs locally THE SYSTEM SHALL use an App Check debug token from `.env.local` (never committed).
3. THE SYSTEM SHALL expose lazy getters for Auth, Firestore, Storage, Remote Config and AI Logic.
4. THE SYSTEM SHALL read Remote Config through typed defaults (routing table, feature flags, `judgeCredits`, `dailyBudgetCredits`, `customProvider`) parsed with zod.

## R4 Authentication
1. THE SYSTEM SHALL support "Continue with Google" and email + password (sign in, create account, reset password).
2. WHEN a signed-out user opens an `(app)` route THE SYSTEM SHALL redirect to `/sign-in?next=<path>`.
3. WHEN a user signs in for the first time THE SYSTEM SHALL create `users/{uid}` through a server route (Admin SDK) with `plan: "free"` and **20 credits**, plus a ledger entry.
4. WHERE the account is on the judge allow-list (server env, not in the repo) THE SYSTEM SHALL set `plan: "judge"` and grant `judgeCredits` from Remote Config (default 500).
5. THE SYSTEM SHALL verify the Firebase ID token and App Check token on every server route.

## R5 Security rules
1. THE SYSTEM SHALL ship `firestore.rules` and `storage.rules` restricting every document and file to its owner.
2. THE SYSTEM SHALL prevent clients from writing `credits`, `plan`, the credit ledger, usage events and `renders/*`.
3. THE SYSTEM SHALL limit uploads to audio ≤ 50 MB (`audio/*`) and images ≤ 10 MB (`image/*`).
4. THE SYSTEM SHALL test the rules on the emulator.

## R6 CI and secrets
1. WHEN code is pushed THE SYSTEM SHALL run install, lint, typecheck, unit + property tests and a gitleaks secret scan in GitHub Actions.
2. THE SYSTEM SHALL keep only variable names in `.env.example`.

## R7 Deploy
1. THE SYSTEM SHALL deploy `apps/web` to Firebase App Hosting in us-central1 with secrets from Secret Manager.
2. WHEN the hosted app loads THE SYSTEM SHALL obtain a valid App Check token.
