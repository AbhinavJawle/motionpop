# Requirements: Planning Engine

## Introduction
Converts a prompt (plus optional data) into a validated Scene: intent → plan → props → validation, then JSON-patch refinement. The AI emits JSON only.

## Glossary
- **Engine**: `packages/engine`.
- **Catalog**: cached description of components, skills and styles.
- **Patch**: RFC 6902-style operation list (`replace`/`add`/`remove`).
- **Model tier**: Haiku-class, Sonnet-class, Opus-class.

## Requirements

### R1: Intent parsing
1. WHEN a prompt is submitted, THE Engine SHALL return an Intent `{message, dataKind, values, emotion, entities}`.
2. THE Engine SHALL detect numbers, currency, units and dates in the prompt and in pasted tables or CSV, and SHALL keep the original values unmodified.

### R2: Planning
1. THE Engine SHALL return a `ScenePlan` (component, skill, stylePack, duration, reasoning) plus up to two alternative skills.
2. WHERE the project defines a default style pack, format or pinned skill, THE Engine SHALL respect it unless the user's request overrides it.
3. WHERE user preferences in the request specify component, skill, style or duration, THE Engine SHALL use them.
4. THE chosen skill SHALL list the chosen component in `works_with`; otherwise THE Engine SHALL choose a compatible one.
5. THE reasoning SHALL be one or two plain-language sentences.

### R3: Props generation
1. THE Engine SHALL produce `{props, direction}` by applying the chosen skill's markdown to the intent and duration.
2. THE output SHALL be parsed as JSON and validated against the component's Zod schema and `DirectionSchema`.
3. THE Engine SHALL NOT accept or emit code in model output.

### R4: Validation and retry
1. THE Engine SHALL run schema validation and the deterministic checks from spec 08.
2. IF validation fails, THEN THE Engine SHALL send the errors back to the model and retry, at most 2 times.
3. IF validation still fails, THEN THE Engine SHALL return a safe default scene for the chosen component populated with the user's data, and flag `usedFallback: true`.
4. WHERE "Pro quality" is requested or after 2 failures, THE Engine MAY use an Opus-class model.

### R5: Refinement by patch
1. WHEN the user gives an edit instruction, THE Engine SHALL return a Patch via a Haiku-class model.
2. THE Engine SHALL reject patches that touch paths listed in `lockElements`.
3. THE Engine SHALL apply the patch, re-validate, and return the new scene; IF invalid, THEN THE original scene SHALL remain unchanged and an error SHALL be returned.
4. Patching SHALL NOT alter any property not addressed by the patch.

### R6: Model routing and cost
1. THE Engine SHALL route per the table: intent+plan+props → Sonnet-class; patch, tagging, naming → Haiku-class; escalation → Opus-class.
2. THE Engine SHALL use prompt caching on the Catalog.
3. THE Engine SHALL record token usage per call.
4. WHERE a user BYOK key is configured, THE Engine SHALL use it server-side for that workspace's calls.

### R7: Performance
Plan + first preview p50 under 6s; patch to updated preview p50 under 1.5s.

### R8: Guardrails
THE Engine SHALL refuse prompts violating content policy and SHALL map "in the style of <brand>" requests to the nearest descriptive style pack with a note.

## Out of scope
Variants, clarifying questions, reference-image matching, script helper, visual QA [V1/V2].
