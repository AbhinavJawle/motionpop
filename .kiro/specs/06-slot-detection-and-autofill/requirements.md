# Requirements: 06 slot detection and auto-fill

After processing, the editor opens with suggested slots already sitting above the words that justify them. Each slot has a "You said …" reason, and on-device auto-fill fills them in the background. Lands by **Sat Nov 21, 2026**. Written in Claude Code.

Behaviour comes from `ai-tasks.md` (§1 `slots.detect`, §3 `component.fill`), `hybrid-ai.md` (routing, repair, fallback), `component-library.md`, `director-skill-format.md`, `architecture.md` (flow 1) and `editor-timeline.md` (suggested slot cards).

Out of scope:
- New components (spec 07). Until then the detector may only choose components that exist in the registry. Others fall back to the nearest existing one.
- Generate in the cloud (the 3-credit upgrade) moves to spec 09 with the inspector.
- AI calls need the Firebase project (AI Logic + App Check). Every AI requirement below has a deterministic, offline path that ships first. The AI tasks are marked blocked.

## R1 Pre-pass tagger
_As a creator, I want the obvious moments (numbers, places, names) found exactly, not guessed._
1. **R1.1** THE SYSTEM SHALL tag spans of the cleaned transcript, each as `TaggedSpan { wordStart, wordEnd, kind, text, value?, unit? }`. The kinds are:
   - `number`: digits, spelled-out numbers, percentages, currency, multipliers such as "doubled";
   - `year`: years and dates;
   - `place`: countries and major cities, from a public-domain gazetteer;
   - `name`: capitalised word sequences not at a sentence start, excluding places;
   - `comparison`: "grew", "fell", "from X to Y", "more than", "versus";
   - `list`: "first … second … third", or "A, B and C".
2. **R1.2** THE SYSTEM SHALL extract values exactly as spoken: "forty percent" → 40 with unit "%", "two point five million dollars" → 2,500,000 with unit "$", "2020." → year 2020.
3. **R1.3** THE SYSTEM SHALL never tag a filler, and SHALL keep spans inside one sentence.
4. **R1.4** THE SYSTEM SHALL be pure and deterministic (same words → same spans), and fast: under 20 ms for 3,000 words.

## R2 Detection
_As a creator, I want a sensible number of graphics, in the right places, without paying for it._
1. **R2.1** THE SYSTEM SHALL turn tagged spans into `SlotSuggestion[]` (schema in `packages/schemas`). Each suggestion has a component, a director skill, a reason quoting the exact spoken words, a score in 0..1, and params extracted from the span (e.g. big-number `{ value: 40, suffix: '%', label: 'Revenue grew' }`).
2. **R2.2** THE SYSTEM SHALL ship a deterministic detector that needs no AI. It scores spans by kind and salience, picks the best ones up to about one slot per 5 s of speech, and maps each to a component and skill from the registries. It is the offline fallback and the default until AI Logic is available.
3. **R2.3** WHERE AI is available THE SYSTEM SHALL run `slots.detect` through the `packages/ai` router: on-device for ≤ 400 words, cloud above (☁ 1 credit per 200 words, cost shown first). The AI gets the words, the tagged candidates, the component catalogue and the skills. Its output is zod-validated with one repair attempt, then falls back to the deterministic detector. _(Blocked on the Firebase project.)_
4. **R2.4** THE SYSTEM SHALL only use component ids from the catalogue in `component-library.md`, and skill ids from `skills/`. Components that aren't built yet (spec 07) are kept as `suggested` slots that don't render, and numbers always map to `big-number`, which exists. Unknown ids are dropped.

## R3 Post-pass
_As a creator, I want suggestions that already obey every timeline rule._
1. **R3.1** THE SYSTEM SHALL post-process every suggestion list, whichever detector produced it:
   - snap to word boundaries;
   - widen to the component's minimum duration inside free space, or drop the suggestion;
   - clamp to the maximum duration;
   - de-overlap by score;
   - enforce gaps of at least 400 ms between slots;
   - validate params against the component schema, filling defaults and recording `needsInput` for anything missing.
2. **R3.2** THE SYSTEM SHALL output slots that pass `timelineIssues` (spec 04 invariants), with `status: "suggested"` and ids unique within the project.
3. **R3.3** THE SYSTEM SHALL prove with fast-check that, for random words and random suggestions, the post-pass output never overlaps, stays inside the transcript, lands on word boundaries, keeps the 400 ms gaps, and respects the component limits.

## R4 Pipeline and editor integration
_As a creator, I want to see Pip find the moments, then open an editor that already has ideas in it._
1. **R4.1** THE SYSTEM SHALL run the tagger as the "Finding moments" step ("Found 6 moments") and detection + post-pass as "Suggesting graphics" ("4 slots found"). The slots are saved with the project.
2. **R4.2** THE SYSTEM SHALL drop the suggested slots into the Processing word strip as dashed cards (springy pop-in, staggered), before the editor opens.
3. **R4.3** WHEN the editor opens THE SYSTEM SHALL show the suggested slots with their reasons, and the Pip bubble "N slots ready".
4. **R4.4** IF no moments are found THEN THE SYSTEM SHALL open the editor with no slots and the empty-track hint "No graphics yet. Shift-drag across words to add one."

## R5 Auto-fill
_As a creator, I want the suggested graphics already forming when I open the editor, for free._
1. **R5.1** THE SYSTEM SHALL fill each suggested slot's params in the background with `component.fill` on-device (PREFER_ON_DEVICE, free). Slots go suggested → generating → ready, one at a time, in timeline order. _(Blocked on the Firebase project.)_
2. **R5.2** UNTIL AI is available, slots whose deterministic params are complete and valid SHALL go straight to `ready` with a `user` version. Slots with `needsInput` stay `suggested`.
3. **R5.3** THE SYSTEM SHALL never auto-fill a slot the user has edited, and SHALL stop auto-filling when the editor closes.

## Non-functional
- Detection plus post-pass under 50 ms for 3,000 words (deterministic path).
- All detection logic is pure and unit-tested. Property tests cover R3.3. The tagger has a table of at least 60 spoken-phrase cases (numbers, years, currency, places, names, comparisons, lists).
