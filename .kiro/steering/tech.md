---
inclusion: always
---

# Tech

## Golden rule
At runtime the AI returns **JSON that is validated by zod** (component id, props, skill application, camera keyframes). It never generates, evals or executes code. All animation lives in handcrafted Remotion components. Any feature that would break this needs Abhinav's explicit approval.

## Toolchain (pinned Nov 12, 2026)
| Tool | Version | Note |
|---|---|---|
| Node | 24 LTS | `.nvmrc`. Agent shell commands start with `source ~/.nvm/nvm.sh && nvm use >/dev/null &&` |
| pnpm | 11 | workspaces via `pnpm-workspace.yaml` |
| Turborepo | 2 | `tasks` key, not `pipeline` |
| TypeScript | 6.0 | Not 7: typescript-eslint supports `<6.1`. Revisit when it supports 7. |
| Next.js | 16 (App Router) | React 19 |
| Remotion | 4.0.x | all `remotion` / `@remotion/*` packages on the **exact same version** |
| zod | 4 | `import { z } from "zod"` |
| Tailwind | 4 | CSS-first config, `@tailwindcss/postcss` |
| Vitest / fast-check | 5 / 4 | unit + property-based tests |
| ESLint | 9.39 flat config + typescript-eslint | Not 10: eslint-plugin-react/import/jsx-a11y (used by eslint-config-next) support ≤9. Prettier for formatting. |

## Conventions
- ESM everywhere (`"type": "module"`). TS strict + `noUncheckedIndexedAccess`. No `any` without a comment explaining why.
- Internal packages export TypeScript source (`exports: { ".": "./src/index.ts" }`), no build step. Next uses `transpilePackages`.
- Pure functions for planning, validation, layout and timing; side effects (AI calls, storage, rendering) at the edges.
- Tests sit next to code: `*.test.ts`, property tests in `*.property.test.ts`.
- Small diffs. Don't regenerate a whole file for a small change.

## Commands (root)
`pnpm typecheck` · `pnpm test` · `pnpm lint` · `pnpm format` · `pnpm build` · `pnpm dev`. Use `pnpm --filter <pkg> <script>` for one package. Long-running commands (`dev`, Remotion Studio) are started by Abhinav, not by the agent.

## AI runtime
- Provider abstraction via the Vercel AI SDK: Amazon Bedrock (default) and Anthropic API (BYOK).
- Model ids live in **one routing table** in `packages/engine`, never inline. Tiers: Sonnet-class (intent, plan, props), Haiku-class (patches, tags), Opus-class (retry after 2 failures only).
- Prompt-cache the static catalog (component schemas, skills, style tokens).

## AWS
Bedrock, S3, CloudFront, Cognito, DynamoDB, Lambda (Remotion Lambda), Amplify Hosting, KMS, Budgets. Region `eu-central-1` unless a service needs another. IaC: AWS CDK (decided in the `auth-and-infra` spec).
