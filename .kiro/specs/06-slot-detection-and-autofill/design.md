# Design: 06 slot detection and auto-fill

## Overview
```
cleaned Word[] ──tagSpans──► TaggedSpan[] ──detect (local now, router later)──► SlotSuggestion[]
                                                   │
                                         postPass(words, suggestions, catalogue, durationMs)
                                                   ▼
                                     Slot[] (suggested | ready) ──► project ──► editor
```
Detection logic is pure and lives in `packages/ai/src/slots/`, so the router (task 9) and the deterministic path share the tagger, the catalogue and the post-pass. The post-pass gets component limits and param schemas through an injected catalogue, so `packages/ai` doesn't depend on rendering code.

## Modules (`packages/ai/src/slots/`)
| File | Exports | Notes |
|---|---|---|
| `numbers.ts` | `parseSpokenNumber(tokens, from) → { value, unit?, end } \| null` | Digits ("40%", "$2.5m", "1,200"), spelled-out numbers ("forty", "two point five million", "a hundred and twenty"), units (% / percent / per cent, $ / dollars, £ / pounds, € / euros, x / times), multipliers ("doubled" → 2 with unit "x", "half" → 0.5). Years 1900–2099 as digits, and "twenty twenty" → 2020. |
| `gazetteer.ts` | `PLACES: ReadonlySet<string>` (lowercased; multi-word entries such as "new york", "united states") | Countries (Natural Earth admin-0 names, public domain) plus about 150 major cities. |
| `tagger.ts` | `TaggedSpan`, `tagSpans(words) → TaggedSpan[]` | Splits sentences at `.?!`, skips fillers, and tags the kinds in R1.1. Overlapping tags are kept (number inside a comparison); the detector picks. |
| `catalogue.ts` | `CatalogueEntry { id, name, useWhen, minMs, idealMs, maxMs, built }`, `CATALOGUE`, `SKILLS` (id, worksWith, useWhen) | Mirrors `component-library.md` (6 components) and the `skills/*.md` frontmatter. A unit test checks that every skill's `works_with` ids exist in the catalogue, and that `built` matches the `@motionpop/motion` registry. |
| `detect-local.ts` | `detectLocal(words, spans, opts) → SlotSuggestion[]` | Deterministic detector (R2.2). |
| `post-pass.ts` | `postPass(input) → Slot[]` | R3, injected `limits(id)` and `validate(id, params)`. |
| `index.ts` | re-exports | |

## Deterministic detector
Each span is scored, then mapped to a component and skill:

| Span | Score | Component | Skill |
|---|---|---|---|
| number with % or currency, inside a comparison | 0.95 | big-number | shocking-stat-reveal |
| number with % or currency | 0.85 | big-number | shocking-stat-reveal |
| comparison with two numbers ("from 10 to 40") | 0.8 | bar-chart | contrast-split |
| list of ≥ 3 items | 0.7 | kinetic-headline | countdown-ranking |
| place | 0.65 | map-zoom | zoom-from-world-to-place |
| year sequence (≥ 2 years in one sentence) | 0.6 | line-chart | slow-build-trend |
| plain number | 0.5 | big-number | shocking-stat-reveal |
| name | 0.4 | callout | calm-explanation |

- **Slot range:** from the sentence's first content word before the span (at most 4 words back) to the span's end, widened by the post-pass to the component's ideal duration where there is room.
- **Budget:** `maxSlots = max(1, round(speechMs / 5000))`. Take the best scores, then restore timeline order.
- **Params:**
  - big-number: `{ value, prefix?, suffix?, label }`, where the label is the up to 3 content words before the number, title-cased ("Revenue grew").
  - Other components: `{}`, with `needsInput: ['…']` from the catalogue until spec 07 defines their schemas.
- **Reason:** `You said '<exact words of the range>'`, with trailing punctuation stripped.

## Post-pass
1. Clamp `wordStart`/`wordEnd` to the transcript. Range = first word's start → last word's end.
2. Sort by score (highest first) and place greedily. A suggestion is kept if, after widening to `minMs` (end first, then start) inside the free gap, it doesn't overlap a kept slot and leaves ≥ 400 ms to each neighbour. Otherwise it is dropped.
3. Widen towards `idealMs` when there is room (same rules), and clamp to `maxMs`.
4. Re-derive `wordStart`/`wordEnd` from the final range (`wordsInRange`).
5. Validate params with the component schema. Valid and nothing missing → keep. Otherwise fill defaults and set `needsInput`.
6. Assign ids `s-<n>`, unique against the existing project slots. Status is `ready` when the component is built and the params are complete (R5.2), otherwise `suggested`.
7. Return the slots in timeline order. They satisfy `timelineIssues`; a property test checks this.

**As built (Kiro run 27 + Claude Code review):** widened edges may land between words (snapping would break minimums or gaps); `wordStart`/`wordEnd` are always re-derived with `wordsInRange` (now in `@motionpop/schemas`). Steps 2 and 3 run as two passes, so a high-score slot never widens into the room a lower-score slot needed to exist.

The 400 ms gap is a suggestion rule only. Users can still place slots edge to edge in the editor (spec 04 R2.2 allows touching slots).

## Pipeline integration (spec 05 run.ts)
- `moments` step: `tagSpans(cleanedWords)`, detail "Found N moments" (or "No moments found").
- `suggest` step: `detect` (injected, `detectLocal` for now) + `postPass`, detail "N slots found".
- New event `{ type: 'slots'; slots }`. The word strip draws dashed slot cards above the pills, with a staggered pop-in.
- `ready` slots get a version `{ source: 'user', costCredits: 0, label: 'v1' }` so the inspector history works.

## AI detection (task 8, as built 2026-11-15)
- `packages/ai/src/tasks/slots-detect.ts`: the task definition (PREFER_ON_DEVICE ≤ `routingSlotsDetectDeviceMaxWords`, else PREFER_IN_CLOUD; `modelStrong`; thinking `LOW`; cloud cost `max(1, ceil(words / 200))`; `cloudFallback: false`). Output is wrapped as `{ slots: SlotSuggestion[] }`, because some structured-output backends reject a top-level array.
- `slotsDetectInput(words, spans)` leaves fillers out but keeps their indices. It sends the catalogue, the skills and `maxSlots = slotBudget(words)`.
- `detectSlots(router | null, words, spans)` never throws. It drops unknown component or skill ids, skills that don't work with the component, and out-of-range words (`keepKnown`, R2.4). It falls back to `detectLocal` without a router, on any router error, or when nothing usable comes back. The caller still runs the post-pass.
- Prompt v1 lives in `prompts/slots-detect.v1.ts` (a string module, see ai-tasks.md).

**As built (task 6, 2026-11-15, Claude Code):** `PipelineDeps` gained `detect(words, spans)` and `validateParams`. The browser uses `detectLocal` and the registry-backed `validateParams` (`lib/slots/validate-params.ts`); AI detection waits for an on-device availability check, so processing never spends cloud credits unasked. The suggest card stays active until the project is saved, so a save failure shows there. Ready slots get version `v-<slotId>-1` (`firstVersions`). The word strip grew to 104 px with a slot row above the pills, and Pip's bubble reads "1 slot ready" / "N slots ready" as soon as the slots event lands.

## Auto-fill (blocked part)
`useAutoFill(projectId)` in the editor walks suggested slots in order. For each: set `generating`, call `component.fill` on-device through the router, validate, then add a version and set `ready`. It stops on unmount and skips slots edited since load. It ships behind `autoFill` in Remote Config (spec 01).

**As built (task 9, 2026-11-15, Claude Code):**
- `component.fill` (`packages/ai/src/tasks/component-fill.ts`) is built per component schema. Its check parses the params, and a failure gets one repair. Purpose `autofill` uses **ONLY_ON_DEVICE**, not PREFER_ON_DEVICE as R5.1 says: without Nano, PREFER would quietly run in the cloud, which breaks "free" and "no surprise spend" (ai-tasks.md §3). Purpose `generate` is ONLY_IN_CLOUD for 3 credits.
- `runAutoFill` / `useAutoFill` (`apps/web/lib/slots/use-auto-fill.ts`), mounted in the editor:
  - It snapshots the slots at load. Then it walks `autoFillQueue` (suggested, renderable, untried, unchanged since load) in timeline order.
  - The `generating` look is a UI-only store field (`autoFilling`), so autosave never persists it.
  - Each result is one undoable `applyAutoFill` command with an `ai-device` version, which is rejected if the slot changed mid-fill.
  - It is gated by `flag_auto_fill`. Any failure leaves the slot suggested.

## Testing
- **Tables:**
  - `numbers.test.ts`, at least 40 cases: "forty percent", "forty-two", "a hundred and five", "two point five million dollars", "$2.5M", "1,200", "£3bn", "doubled", "three times", "twenty twenty", "2020.", "nineteen ninety-nine", "zero". Also rejections: "the", "one of the", "first", where it should stay unparsed or be a list ordinal.
  - `tagger.test.ts`, at least 20 cases, including the demo transcript (expected: the 40 % comparison, 2020 as a year, no false names at sentence starts).
- **Properties (fast-check):**
  - The post-pass (R3.3): no overlaps, inside bounds, word-aligned, ≥ 400 ms gaps, limits respected, ids unique.
  - The tagger never tags fillers and never spans sentences.
  - Detection is deterministic.
- **Integration:** the sample voiceover gives slots (2020 / 40 % → big-number ready) through the Processing screen. Perf tests check 3,000 words: the tagger < 20 ms (R1.4), detection plus post-pass < 50 ms.
