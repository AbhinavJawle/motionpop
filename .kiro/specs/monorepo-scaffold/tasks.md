# Tasks: monorepo-scaffold

- [x] 1. Root workspace and tooling
  - `package.json` (scripts, `packageManager`, `engines`), `pnpm-workspace.yaml` with catalog, `turbo.json`, `tsconfig.base.json`, `eslint.config.js`, `.prettierrc.json`, `.gitignore`, `.kiroignore`
  - _Requirements: 1.1, 1.2, 1.3, 2.1, 3.1, 3.2, 7.1_

- [x] 2. `@motionpop/schemas` package with format presets
  - `package.json`, `tsconfig.json`, `vitest.config.ts`, `src/formats.ts`, `src/index.ts`
  - _Requirements: 5.1, 5.2_

- [x] 3. Tests for format presets
  - `formats.test.ts` (exact values) and `formats.property.test.ts` (safe-area invariant)
  - _Requirements: 4.1, 4.2, 5.3_

- [x] 4. `apps/web` shell
  - Next 16 + React 19 + Tailwind 4, dark layout, placeholder page that imports a format preset, `next.config.ts` with `transpilePackages`, `eslint.config.mjs`, `.env.example`
  - _Requirements: 6.1, 6.2, 7.2_

- [x] 5. CI workflow
  - `.github/workflows/ci.yml`: pnpm install (frozen lockfile), typecheck, lint, format:check, test, build
  - _Requirements: 7.3_

- [x] 6. Verify
  - Run `pnpm install`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, `pnpm build`; all must pass with zero errors
  - _Requirements: 1.1, 1.2, 2.2, 3.3, 4.2, 6.3_
