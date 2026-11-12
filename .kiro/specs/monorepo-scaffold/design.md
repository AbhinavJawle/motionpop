# Design: monorepo-scaffold

## Layout after this spec
```
package.json            root scripts, packageManager pnpm@11, devDeps for tooling
pnpm-workspace.yaml     apps/*, packages/*; allowBuilds for native deps
turbo.json              tasks: typecheck, lint, test, build, dev
tsconfig.base.json      shared strict settings
eslint.config.js        typescript-eslint flat config (root)
.prettierrc.json        formatting
.gitignore / .kiroignore
.github/workflows/ci.yml
packages/schemas        @motionpop/schemas (format presets + tests)
apps/web                Next.js 16 shell
```

## Key decisions
| Decision | Choice | Reason |
|---|---|---|
| Internal package builds | None. Packages export `./src/index.ts`; Next uses `transpilePackages`; Vitest and tsc read source. | Fewer moving parts, no stale `dist/`, instant changes across packages. |
| Typecheck | `tsc --noEmit` per package, run by Turborepo | Simple and cacheable. No project references needed without builds. |
| Lint | One root `eslint.config.js` for packages; `apps/web` has its own config extending `eslint-config-next` | Next's config needs the app's context. |
| Test runner | Vitest per package (`vitest run`) | Matches the "Tests sit next to code" convention. |
| TS version | 6.0.x | typescript-eslint peer range is `<6.1`. |
| ESLint version | 9.39.x | Next's lint plugins don't support ESLint 10 yet. |
| Dependency versions | Shared versions declared once in a pnpm **catalog** (`pnpm-workspace.yaml`), referenced as `catalog:` | Keeps `remotion`/`@remotion/*` on one exact version later, and avoids drift. |

## Format presets (`packages/schemas/src/formats.ts`)
Safe-zone insets are fractions of width/height.

| id | size | fps | safe zone (top, right, bottom, left) | note |
|---|---|---|---|---|
| `youtube-16x9` | 1920×1080 | 30 | 0.05, 0.05, 0.05, 0.05 | title-safe |
| `shorts-9x16` | 1080×1920 | 30 | 0.12, 0.12, 0.20, 0.05 | platform UI: top bar, right action rail, bottom caption area |
| `square-1x1` | 1080×1080 | 30 | 0.05, 0.05, 0.05, 0.05 | |
| `product-demo-16x9` | 1920×1080 | 30 | 0.05, 0.05, 0.05, 0.05 | loop-friendly |

The Shorts values are a starting estimate; the `render-pipeline` spec draws the overlay and we tune them against real platform screenshots.

Helper: `getSafeArea(preset) → { x, y, width, height }` in **whole pixels** (each inset rounded, so layout edges stay crisp and float drift can't leak into layout). Property test (Req 5.3): for every preset, `width > 0 && height > 0` and the rectangle lies inside the frame.

## Testing
- `formats.test.ts`: exact sizes for each preset; `getSafeArea` for YouTube equals `{ x: 96, y: 54, width: 1728, height: 972 }`.
- `formats.property.test.ts`: the safe-area invariant for all presets, plus for arbitrary valid insets (fast-check) that `getSafeArea` stays inside the frame.
