---
inclusion: always
---

# Structure

```
apps/web               Next.js app: UI, route handlers, server actions
packages/schemas       zod schemas + shared types (formats, scene, direction)
packages/styles        style pack tokens
packages/skills        built-in director skills (.md) + parser/validator
packages/components    Remotion scene components, Remotion Studio root
packages/checks        deterministic quality checks
packages/engine        intent, planning, props, patching, model routing
packages/render        render orchestration (local + Remotion Lambda)
infra                  AWS CDK
docs                   KIRO_CONTEXT.md, product-spec.md, drafts/ (pre-spec drafts, not code)
.kiro                  steering, specs, hooks, settings (dev only, never gitignored)
KIRO_LOG.md            log of how Kiro was used
```

Packages are created by the spec that first needs them, not in advance.

## Dependency direction (no cycles, enforced in review)
- `schemas` → only `zod`.
- `styles`, `skills`, `checks` → `schemas`.
- `components` → `schemas`, `styles`.
- `engine` → `schemas`, `styles`, `skills`, `checks`.
- `render` → `components`, `schemas`.
- `apps/web` → any package. **No package imports from `apps/web`.**
- Server-only code (AI keys, AWS SDK) never ends up in a client component.

## Naming
- Files: `kebab-case.ts`; React components: `PascalCase.tsx`.
- Ids (components, skills, style packs, formats): `kebab-case`, stable once shipped.
- Scene component folder: `packages/components/src/scenes/<component-id>/`.
- Package names: `@motionpop/<folder>`.
