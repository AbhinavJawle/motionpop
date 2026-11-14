---
inclusion: always
---

# Repository structure and conventions

```
apps/web/
  app/                    (marketing)/, (auth)/sign-in, (app)/dashboard|start|processing/[id]|editor/[id]|styles|settings, share/[id], api/*
  components/             ui/ (shadcn primitives), editor/, timeline/, inspector/, dashboard/, start/, pip/, export/
  lib/                    firebase/, app-check, auth, stores/ (zustand), commands/ (undo/redo), hooks/, utils
  styles/globals.css      design tokens (from design/figma-export.css)
  workers/                whisper.worker.ts, peaks.worker.ts
packages/schemas/src/     project, slot, transcript, version, render, credits, ai, style, skill, time
packages/motion/src/
  core/                   timeline, tween, eases, stagger, text split, path draw, count-up, rng, fitText
  components/<id>/        params.ts (zod), layout.ts (per format), build.ts, index.ts, README.md, *.test.ts
  styles/<id>.json        style packs
  compiler/               project JSON → HyperFrames composition HTML
  runtime/                hf-seek bridge, captions overlay
  sfx/                    deterministic synthesized SFX
  scripts/check.ts        motion:check (stills + layout/contrast assertions)
packages/ai/src/          router.ts, tasks/*.ts, prompts/*.v1.md, cost.ts, providers/(firebase|claude).ts
services/render/          Cloud Run service: Dockerfile, src/server.ts, src/render.ts
skills/                   director skills (*.md)
design/                   screens/*.png + figma-export.css (read-only)
docs/                     plan, decisions, third-party, demo scripts, checklist, write-ups
.kiro/                    steering/, specs/, agents/, settings/mcp.json, skills/
.claude/                  skills/, commands/
```

## Conventions
- Files kebab-case. React components PascalCase, one per file.
- Workspace imports: `@motionpop/schemas`, `@motionpop/motion`, `@motionpop/ai`.
- Server-only code lives in `app/api/**` or `*.server.ts` (with `import "server-only"`). Never import server modules into client components.
- Every external input (AI output, uploads, Firestore reads, request bodies) is parsed with zod.
- Feature flags and model routing come from Remote Config with typed defaults.
- No `any` without a comment explaining why. Prefer small modules and pure functions.
- Conventional commits referencing the spec task: `feat(03-motion-engine): task 2 eases`.
