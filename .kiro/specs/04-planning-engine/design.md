# Design: Planning Engine

## Modules (`packages/engine/src`)
```
llm/provider.ts       # Vercel AI SDK wrapper: bedrock | anthropic(BYOK)
llm/router.ts         # task → model tier
catalog/build.ts      # catalog JSON from registry + skills + styles; stable ordering
pipeline/intent.ts    # parseIntent
pipeline/plan.ts      # planScene
pipeline/props.ts     # generateProps
pipeline/validate.ts  # schema + spec-08 checks
pipeline/generate.ts  # orchestrates, retries, fallback
pipeline/patch.ts     # refine + applyPatch
pipeline/fallback.ts  # safe default scene per component
data/detect.ts        # numbers/currency/dates/CSV detection
guardrails/policy.ts
usage.ts              # token usage recording
```

## Flow
```
prompt ─► detectData ─► parseIntent (Sonnet)
       ─► planScene (Sonnet + cached catalog) ─► ScenePlan (+2 alt skills)
       ─► generateProps (Sonnet, skill markdown) ─► JSON
       ─► validate ─┬─ ok ─► Scene
                    └─ fail ─► retry with errors (≤2) ─► fallback / Opus
```

## Model output contract
All calls use structured output with a Zod schema (`generateObject`). Prompts state: "Return JSON only." Free text fields are limited to `reasoning`. No tool for code execution is provided.

## Prompt caching
System block order (static first): rules → catalog JSON → skills → style tokens. Cache breakpoint after the catalog. Dynamic block: project defaults, intent, user request.

## Data handling
`detect.ts` extracts raw values; the model sees them but `validate.ts` compares final props against detected values (see spec 08 data-match). Original values never rewritten by the model.

## Patch application
```ts
type PatchOp = { op: 'replace'|'add'|'remove'; path: string; value?: unknown };
applyPatch(scene, ops, lock) -> Result<Scene, Error>
```
Uses `fast-json-patch` on a cloned scene; path check against lock list prefixes; Zod re-validation before commit.

## Skill application
The model gets the skill markdown plus `durationSeconds`; it must output explicit `direction.camera[].t`, `holdAt`, `sfx[].t` as 0–1 normalized values. Engine's `toSeconds` is used for validation of hold lengths.

## API (Next.js)
- `POST /api/scenes/plan` → `{plan, alternatives}`
- `POST /api/scenes/generate` → `{scene, usedFallback, usage}`
- `POST /api/scenes/:id/refine` → `{scene}`
All require auth and rate limiting (spec 07).

## Cost tracking
Each call returns `{inputTokens, cachedTokens, outputTokens, tier}`; stored per scene version for margin analysis.

## Testing
- Mock provider with canned JSON for unit tests (retry path, fallback path, lock violation).
- Property tests: applyPatch leaves untouched paths deep-equal; fallback scene always validates.
- A small live eval script (not CI) with 10 prompts, reporting validity rate and latency.
