# Requirements: monorepo-scaffold

Quick Spec. Replaces the first scaffold (commit `4b9905e`), which failed to type-check (TS5095) and used Turborepo 1 config. Toolchain versions are fixed in `.kiro/steering/tech.md`.

## Introduction
A minimal, working pnpm + Turborepo monorepo that later specs build on. It contains only what the first feature spec (`render-pipeline`) needs: the root tooling, one shared package and the web app shell. Other packages are created by the specs that need them.

## Requirement 1: Workspace and task runner
**User story:** As the developer, I want one command per task across all packages, so that checks are identical locally, in hooks and in CI.

1.1 WHEN `pnpm install` runs at the repo root THE SYSTEM SHALL install all workspace packages listed in `pnpm-workspace.yaml` (`apps/*`, `packages/*`) without errors.
1.2 WHEN `pnpm typecheck`, `pnpm lint`, `pnpm test` or `pnpm build` runs at the root THE SYSTEM SHALL run that task in every package that defines it, via Turborepo 2.
1.3 THE SYSTEM SHALL declare the package manager in the root `package.json` (`packageManager`) and the minimum Node version (`engines`).

## Requirement 2: TypeScript
**User story:** As the developer, I want strict, shared TypeScript settings, so that every package catches the same errors.

2.1 THE SYSTEM SHALL provide `tsconfig.base.json` with `strict`, `noUncheckedIndexedAccess`, ESM module settings and `moduleResolution: bundler`, and every package SHALL extend it.
2.2 WHEN `pnpm typecheck` runs on the scaffold THE SYSTEM SHALL report zero errors.

## Requirement 3: Lint and format
3.1 THE SYSTEM SHALL provide an ESLint flat config at the root with typescript-eslint, plus Next's config for `apps/web`.
3.2 THE SYSTEM SHALL provide Prettier config and `pnpm format` / `pnpm format:check` scripts.
3.3 WHEN `pnpm lint` runs on the scaffold THE SYSTEM SHALL report zero errors.

## Requirement 4: Tests
4.1 THE SYSTEM SHALL run Vitest in every package with tests, and fast-check SHALL be available for property-based tests.
4.2 THE SYSTEM SHALL include one example unit test and one example property test in `@motionpop/schemas`, and both SHALL pass.

## Requirement 5: Shared schemas package
5.1 THE SYSTEM SHALL provide `@motionpop/schemas` exporting TypeScript source with zod 4 as its only runtime dependency.
5.2 THE SYSTEM SHALL export the four MVP format presets (`youtube-16x9`, `shorts-9x16`, `square-1x1`, `product-demo-16x9`) with width, height, fps and safe-zone insets.
5.3 WHEN any format preset is read THE SYSTEM SHALL guarantee its safe zone leaves a positive drawable area (property test).

## Requirement 6: Web app shell
6.1 THE SYSTEM SHALL provide `apps/web` on Next.js 16 (App Router), React 19 and Tailwind 4, with a dark root layout and a minimal placeholder home page that links nowhere.
6.2 THE SYSTEM SHALL import `@motionpop/schemas` from the web app and type-check it.
6.3 WHEN `pnpm build` runs THE SYSTEM SHALL produce a successful production build of `apps/web`.

## Requirement 7: Repo hygiene
7.1 THE SYSTEM SHALL ignore `.env*` files except `.env.example` in both `.gitignore` and `.kiroignore`, and SHALL NOT ignore `.kiro/`.
7.2 THE SYSTEM SHALL provide `apps/web/.env.example` containing only placeholder values.
7.3 THE SYSTEM SHALL provide a GitHub Actions workflow that runs install, typecheck, lint, test and build on push and pull request.
