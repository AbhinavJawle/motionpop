# Design: 10 Pip panel

_Written headlessly in Kiro CLI (claude-opus-5.5), 2026-11-16. Requirements in `requirements.md`._

## 0. Decisions taken without the founder (D-035)

| # | Decision | Why |
|---|---|---|
| 1 | **Suggestion chips are planned in code** (`intentPlan`), free and instant; typed messages go to `pip.plan`. | The chips are known intents; spending 2 credits on them would be waste, and it is why the design's empty state shows "⚡ free · on-device". Pip says "Planned on your device", never claims a model ran. |
| 2 | **Route is chosen by code before sending**: slot scope + Nano available + prompt ≤ 6,000 tokens → `ONLY_ON_DEVICE`; else `ONLY_IN_CLOUD`. Not `PREFER_*`. | `PREFER_ON_DEVICE` can quietly reach the cloud (no surprise spend, D-027) and `PREFER_IN_CLOUD` would make the hint a guess. The hint shown is the route used. A failed device plan offers "Ask in the cloud ☁ 2" instead of escalating. `ai-tasks.md` §6 says PREFER_IN_CLOUD; proposed steering change below. |
| 3 | **Model step shape is flat with sentinels**: `{ action, slot, choice, atWord, instruction, label }`, all required, `"none"` / `-1` / `""` for unused. `estimatedCredits` is dropped from the model output; code computes cost. | Structured output supports only `enum, items, maxItems, nullable, properties, required` (no `anyOf`), and `args: Record<string, unknown>` breaks the schema rules (ids are enums, ≤ 6 optional properties). |
| 4 | **Steps land one by one, always as one undo entry**: the plan's history entry is amended (`amendTop`) with a growing composite as each step lands. If the user edits in between, the remaining steps land as a second entry, "Pip plan (continued)". | Matches the design's mid-apply moment (steps ✓, "…in progress", "Updated 3 slots" already showing) and keeps R5.4. |
| 5 | Undo on the action card **stops and undoes the whole plan**; there is no separate Stop button. | The design has no Stop; Undo is the obvious escape. |
| 6 | "Use brand colours everywhere" without a brand kit gets an honest reply ("You haven't set brand colours yet. Brand kits are on their way, so for now try a different style from the Style pill.") and no steps. "Translate captions to German" likewise. | Brand kits are spec 16; caption translation is not planned for the MVP. Founder question 1. |
| 7 | Generations in a plan cost 3 credits each (same as Generate); addSlot fills on the device or with the scene's safe default (free). | Same price everywhere; adding a title stays free. |
| 8 | Attach and mic are present, with "on its way" tooltips. | Design shows them; handoff §10 forbids dead clicks. |
| 9 | Chat docs carry a `threadId`; "+" starts a new thread; only the latest thread shows. Earlier threads are kept for a later history view. | Smallest model that supports R7.2. |
| 10 | The left-panel container (R1) and the coming-soon panel live in this spec. | It is implemented first (plan order 10 → 11 → 12); specs 11 and 12 put their panels in it. |

## 1. Components

```
components/editor/
  left-panel.tsx           container: 340 wide, slide+fade 240 ms, collapse chevron, Escape, focus return
  panels/coming-soon.tsx   Pip (size 56, idle) + "{Name} is on its way" + one line + "Back to Pip"
  pip-panel/
    pip-panel.tsx          header + body (empty | thread) + composer + hint
    pip-header.tsx         "Pip ▾" menu (New conversation, Clear this conversation), Style pill (StyleMenu), "+"
    pip-empty.tsx          orb + title + body + SuggestionChips
    suggestion-chips.tsx
    scope-chips.tsx
    composer.tsx           textarea (auto-grow to 4 lines), attach, mic, Style chip, send
    route-hint.tsx         CostChip variants (spec 02) + "Needs connection"
    thread.tsx             role="log"; MessageCard | PipReply | PlanCard | ActionCard
    plan-card.tsx          steps, states, Edit plan mode, Apply all
    action-card.tsx        thumbnails (SlotThumb from the timeline slot card), Undo/Redo, View on timeline
    style-menu.tsx         list from the style registry
lib/pip/
  summary.ts       projectSummary(project, scope) → PipPlanInput (pure)
  route.ts         pipRoute(...) → { mode, hint } (pure)
  intent.ts        intentPlan(message, project) → RawPlan | null (pure)
  enforce.ts       enforcePipPlan(raw, project, ctx) → PipPlan (pure)
  apply.ts         runPlan(plan, deps, onEvent, signal)  (async orchestrator, injected deps)
  step-commands.ts stepCommand(step, project, prepared) → Command (pure)
  chat-repo.ts     ChatRepository (Memory, Idb, Firestore)
  use-pip.ts       React glue: thread state, send, apply, undo
lib/commands/
  slots.ts         + setSlotStyle(id, styleId | null), applyGenerated(slotId, expected, result) (applyAutoFill with source 'plan')
  history.ts       + amendTop(history, project, expectedTop, next)
packages/ai/src/
  tasks/pip-plan.ts, prompts/pip-plan.v1.ts
packages/schemas/src/pip.ts
```

Store changes (`lib/stores/editor.ts`): `rail: RailItem | null` (null = closed), persisted in `localStorage` (`mp:rail`); `pip: { status: 'idle' | 'planning' | 'applying' }` for `PipDock`'s bubble. `PipDock` reads it: "Pip is thinking…" while planning or applying.

## 2. Schemas (`packages/schemas/src/pip.ts`)

```ts
export const PIP_ACTIONS = ['updateSlot','addSlot','removeSlot','setStyle','setCaptions','generateSlot','setFormat'] as const;
export const PipActionSchema = z.enum(PIP_ACTIONS);

/** What the model returns (structured output). Sentinels: slot "none", choice "none", atWord -1, instruction "". */
export const PipModelStepSchema = z.object({
  action: PipActionSchema,
  slot: z.string(),            // enum at call time: "s1".."sN" + "none"
  choice: z.string(),          // enum at call time: style ids, formats, caption values, component ids, "none"
  atWord: z.number().int(),    // word index for addSlot, else -1
  instruction: z.string().max(200),
  label: z.string().max(120),
});
export const PipModelOutputSchema = z.object({
  reply: z.string().min(1).max(240),
  steps: z.array(PipModelStepSchema).max(8),
});

/** After enforcement: what the plan card shows and Apply all runs. */
export const PipStepSchema = z.object({
  id: z.string(),                                    // "step-1"…
  action: PipActionSchema,
  slotId: z.string().optional(),                     // real slot id, resolved from "sK"
  styleId: z.string().optional(),
  format: FormatSchema.optional(),
  captions: z.enum(['on','off','pop','clean','boxed']).optional(),
  componentId: z.string().optional(),
  atWord: z.number().int().nonnegative().optional(),
  instruction: z.string().max(200).optional(),
  label: z.string().min(1).max(60),
  credits: z.number().int().nonnegative(),           // code-computed
  include: z.boolean().default(true),                // Edit plan
});
export const PipPlanSchema = z.object({
  reply: z.string().max(240),
  steps: z.array(PipStepSchema).max(8),
  dropped: z.array(z.object({ label: z.string(), reason: z.string() })).max(8),
  source: z.enum(['device', 'cloud', 'code']),
});
export const PlanStateSchema = z.enum(['proposed','applying','applied','stopped','undone','dismissed']);
export const StepStateSchema = z.enum(['pending','running','done','skipped']);

export const ChatMessageSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1), threadId: z.string().min(1),
  role: z.enum(['user', 'pip']),
  text: z.string().max(2000),
  scope: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('video') }),
    z.object({ kind: z.literal('slot'), slotId: z.string().min(1) }),
  ]),
  plan: PipPlanSchema.optional(),
  planState: PlanStateSchema.optional(),
  stepStates: z.record(z.string(), z.object({ state: StepStateSchema, reason: z.string().max(120).optional() })).optional(),
  result: z.object({ slotIds: z.array(z.string()).max(60), changes: z.number().int().nonnegative() }).optional(),
  ranOn: z.enum(['device','cloud','code']).optional(),
  model: z.string().optional(),
  credits: z.number().int().nonnegative().default(0),
  createdAt: z.number().int().nonnegative(),          // epoch ms (D-034)
});
```

Input to the task (`PipPlanInputSchema`, in `packages/ai/src/tasks/pip-plan.ts`):

```ts
{ route: 'device' | 'cloud',
  project: { format, styleId, styles: [{ id, name }] (≤ 12), captions: { enabled, preset },
             slots: [{ ref: 's1', componentId, name, title, reason, status, startMs, endMs }] (≤ 40),
             words: [i, text][]  (cloud: all, up to 3,000; device: the scoped slot's words ± 30),
             components: [{ id, name, useWhen }] (the scene/component catalogue, ≤ 12) },
  scope: 'video' | 'sK',
  history: [{ role, text }] (last 3 turns, user text ≤ 300 chars each, Pip's reply + step labels),
  message: string (≤ 1,000) }
```

The structured-output schema is built per call (`jsonSchema(input)`), with `slot` and `choice` as enums of exactly the values valid for this project (`choice` ≤ 40 values: styles + 3 formats + 5 caption values + components + "none"; if a catalogue would exceed 40, the least-used styles are left out and the style menu still works). It passes the `schema-rules.test.ts` walk: depth 3, no optional properties, enums ≤ 40, no schema text in the prompt.

## 3. Prompt (`prompts/pip-plan.v1.ts`)

System: who Pip is (the video's assistant), what each action does, rules: plan only what the user asked; never invent numbers, names or dates (they come from the words); prefer the fewest steps; `instruction` is a short edit request in the user's words for updateSlot/generateSlot, or the title text intent for addSlot; reply in one short warm sentence ("Here's the plan" when there are steps); if the request is impossible, reply honestly with no steps. Two hand-approved examples: "Make every chart use my brand colours and add a title at the start" (brand kit present in the example input) → setStyle on chart slots + addSlot at word 0; and "Make slot 2 slower" with slot scope → one updateSlot. On-device: the same text goes in `onDeviceParams.createOptions.initialPrompts` (handoff §8: Nano ignores `systemInstruction`). Thinking `LOW` in the cloud.

## 4. Routing (`lib/pip/route.ts`)

```ts
pipRoute(i: { message: string; scope: 'video' | 'slot'; fromChip: boolean; nano: 'available' | 'unavailable';
              online: boolean; killSwitch: boolean; promptTokens: number; pendingPlanCredits: number | null })
  → { mode: 'code' | 'device' | 'cloud' | 'blocked'; hint: Hint }
type Hint = { kind: 'free' } | { kind: 'cloud'; credits: number } | { kind: 'blocked'; text: string }
```

| Situation | mode | hint |
|---|---|---|
| empty message, plan waiting | — | its apply cost: `free` if 0, else `cloud ~n` |
| empty message, nothing waiting | — | `free` (R3.5) |
| suggestion chip | code | `free` |
| slot scope, Nano available, tokens ≤ 6,000 | device | `free` |
| online, not kill switch | cloud | `cloud ~2` |
| offline or kill switch, Nano available, tokens ≤ 6,000 | device | `free` |
| offline, otherwise | blocked | "Needs connection" |
| kill switch, otherwise | blocked | "Pip is resting. Small edits still work." |

`promptTokens` = `ceil(chars / 4)` of the rendered prompt plus schema (the Firebase docs say the schema counts toward input tokens). Nano availability comes from the router's startup check (hybrid-ai.md).

Plan apply cost (`planCost(plan, nano)`) = Σ included steps: generateSlot 3; updateSlot 0 when Nano is available, else 1 (the edit.patch cloud fallback); everything else 0.

## 5. Enforcement (`lib/pip/enforce.ts`)

Pure, total (never throws), in this order:
1. Map `slot` refs to ids; unknown → drop ("That slot isn't there any more").
2. Validate `choice` per action (style id for setStyle; format for setFormat; `on|off|pop|clean|boxed` for setCaptions; component id for addSlot, default `hook-statement` when "none"); invalid → drop.
3. addSlot: `atWord` inside the transcript and not inside an existing slot (or inside a slot added by an earlier step, using a projected slot from `slotForWords`) → else drop ("No room there").
4. Drop any step on a slot that an earlier step removes; drop exact duplicates; keep the last setFormat / setStyle (video) / setCaptions.
5. Cap at 8 steps and 6 generateSlot steps (extra → dropped with "Too many at once").
6. Label: the model's label if 1–60 characters, else a code label ("Restyle Slot 2", "Add an opening title", "Switch to 9:16"…).
7. Credits per step and total (§4).

`dropped` keeps what was removed and why; the plan card lists it under the steps in `text-3`.

## 6. Code-built plans (`lib/pip/intent.ts`)

| Chip / phrase | Plan |
|---|---|
| "Fill the {n} empty slots" | generateSlot for each `suggested` or `failed` slot (≤ 6), reply "Here's the plan" |
| "Add an opening title at 0:00" | addSlot at word 0, component `hook-statement` (scene) or `kinetic-headline` if scenes are off |
| "Tighten graphics to match my pace" | updateSlot "make it a little faster" for each ready slot whose duration is over its component's ideal |
| "Use brand colours everywhere" | no brand kit → honest reply, no steps (§0 #6) |
| "Translate captions to German" | honest reply: "Translated captions aren't here yet. I can switch the caption style instead." |

It also runs as the fallback for a failed model plan (R4.5), matching the message case-insensitively against these phrases.

## 7. Applying a plan (`lib/pip/apply.ts`)

```
runPlan(message, deps{ store, router, credits, fill, editPatch, now, newId }, onEvent, signal)
  0. total = planCost(included steps); credits.balance < total → spec 13 "Pip needs a recharge" modal, stop.
  1. planState ← applying; persist
  2. for step of included steps (in order):
       onEvent(step running)
       prepared = await prepare(step)                  // may be async and paid
         updateSlot   → router.run(editPatchTask(...)) with the device route only; if that fails and the
                        user is online: credits.spend('edit', 1, …) then the same task in the cloud
                        (the router's built-in escalation is not used here, so the spend always comes first)
         generateSlot → credits.spend('generate', 3, `${msgId}:${step.id}`) → componentFill ONLY_IN_CLOUD
                        (gates + 2 repairs, spec 07) → version { source: 'plan', costCredits: 3 } ; failure → refund
         addSlot      → slotForWords(atWord…) → on-device component.fill (ONLY_ON_DEVICE) or safeScoreFromWords
         others       → nothing to prepare
       cmd = stepCommand(step, store.project, prepared)        // throws CommandRejected → skipped(reason)
       commit(cmd)                                             // §7.1
       onEvent(step done | skipped)
       if signal.aborted → break (Undo pressed)
  3. planState ← applied (or stopped); result { slotIds, changes }; persist
```

### 7.1 One undo entry while steps land one by one

```ts
amendTop(h: History, p: EditorProject, expectedTop: Command, next: Command): HistoryResult
// precondition: h.past.at(-1) === expectedTop; result = exec(undo(h, p), next) with future cleared
```

- First landed step: `entry = composite('Pip plan', [cmd1])`, `store.exec(entry)`.
- Later steps: `next = composite('Pip plan', [...landed, cmdK])`; if `history.past.at(-1) === entry`, `store.amend(entry, next)` and `entry = next`; otherwise the user edited in between, so a new entry `composite('Pip plan (continued)', [cmdK])` is exec'd and becomes `entry`.
- Re-running earlier commands inside `next.do` is safe: commands are pure and capture their undo data in `do` (spec 04), and prepared results (patches, versions) are plain data.
- If the user undoes the plan's entry with ⌘Z while it applies (the entry moves to `history.future`), `runPlan` aborts: the remaining steps never land, so Pip can't pile changes on top of an undo.
- Undo on the action card: abort the signal, wait for the running step to settle (its result is discarded and its credits refunded if not committed), then `store.undo()` once per entry this plan created, only while each entry is the top of the history (R6.2).

### 7.2 Step → command (`step-commands.ts`)

| Step | Command |
|---|---|
| updateSlot | `updateParams(slotId, patch)` (spec 04) |
| generateSlot | `applyGenerated(slotId, expectedSnapshot, { params, needsInput, version })`: `applyAutoFill` semantics (rejects if the slot changed since the step started, R5.6), version source `plan` |
| addSlot | `composite([addSlot(slot), applyGenerated(...)])` |
| removeSlot | `deleteSlot(slotId)` |
| setStyle | video: `setStyle(styleId)`; slot: `setSlotStyle(slotId, styleId)` (new) |
| setCaptions | `setCaptions(...)` from spec 12 task 2 (if spec 10 lands first, implement spec 12 tasks 1–2 here and tick them there) |
| setFormat | `setFormat(format)` |

Rate limits (30 cloud generations per hour) and the daily budget kill switch are enforced server-side by the spec 13 spend route; a refused spend shows its reason and the step is skipped.

## 8. Chat persistence

`ChatRepository { latestThread(projectId): Promise<ChatMessage[]>; put(projectId, msg): Promise<void>; clearThread(projectId, threadId): Promise<void> }`. Firestore: `projects/{id}/chat/{msgId}`, query `where('threadId','==',t).orderBy('createdAt')`, the latest thread from the newest message (`orderBy('createdAt','desc').limit(1)`). IndexedDB in local mode. Messages are written on send, on Pip's reply and on each plan state change (debounced 300 ms during apply). Rules (`firestore.rules`): inside `projects/{pid}/chat/{msgId}` require `role in ['user','pip']`, `text is string && text.size() <= 2000`, `schemaVersion == 1`; owner-only as for every project sub-document.

## 9. Matching the PNGs (2× exports: CSS px = PNG px ÷ 2)

From the CSS frame "Pip · AI panel · Empty state": panel 340×544 at (72, 56), `#0F0F15`, 1 px right border; collapse button 24×24 at panel x 328, y 260, `rgba(36,33,47,.2)`, border `#474052`, r12, glass shadow. Suggestion chips 292×26 at panel x 24 from y 224, `#15151E`, border `#2A2735`, r13, 6 px apart, 12 px text `text`. Composer block 308×140 at panel (16, 392): scope chips row first ("Whole video · selected" 112×24, `#29213F`, border `#51416F`, glow `0 0 12px rgba(139,124,255,.1)`, r12), then the input 308×80 at y 32, `#17151F`, border `#383044`, r12; send 32×32 at input (264, 40), `#FF7A3D`, glow `0 0 16px rgba(255,122,61,.22)`, r16. Hint centred under the composer. Orb: Pip ~40 px tall in a violet radial glow about 120 px across, centred above the title (17 px semibold), body 13 px `text-2` centred, two lines.

Conversation (measured from `pip-conversation.png`; refine against its CSS frame in task 13): user message card ≈ 276×64 right-aligned with 24 px inset, `#1D1A28`-ish with a violet hairline; "Pip  Here's the plan" row with the Pip face 16 px; plan card ≈ 292×143, steps 13 px with the mint ✓ at the right, "…in progress" pill under the running step; "Apply all" ≈ 128×28 `violet-fill` r8 and "Edit plan" ≈ 132×28 outline; action card ≈ 292×80 with three 36×24 thumbnails, "Undo" (violet text) and "View on timeline". Hint "☁ ~3 credits" centred under the composer.

The preview shrinks when the panel is open; the design's toolbar shows "62%" there and "75%" in `editor.png`. Preview zoom belongs to the preview toolbar (spec 04/09) and the design check masks that label.

## 10. Failure handling

| Failure | Behaviour |
|---|---|
| Model answer invalid after one repair | refund; code plan for the message if any; else "I couldn't plan that one. Try asking for one change at a time." |
| Device plan fails | Pip: "That one's a bit much for your device." + button "Ask in the cloud ☁ 2" |
| Spend refused (insufficient) | spec 13 modal; nothing sent |
| Spend unavailable (route down) | "Couldn't reach your credits. Nothing was charged." Retry |
| A generation step fails | refund its 3 credits; step "Skipped · Couldn't generate"; the plan goes on |
| Out of credits mid-plan | remaining generation steps "Skipped · Out of credits"; free steps still land; modal once |
| Reload mid-apply | planState → stopped on next load; Undo disabled with the reload note |
| Offline / kill switch | R8.3, R8.4 |

## 11. Testing approach

- **Unit:** `projectSummary` (scope trimming, ≤ 40 slots, words window), `pipRoute` table, `intentPlan` per chip, `enforcePipPlan` per rule, `stepCommand` per action, `amendTop`, `planCost`, chat schema, the task's `jsonSchema` (in `schema-rules.test.ts`), the prompt size under the device budget for the demo project.
- **Router integration with a fake provider:** a device route never calls the cloud; an invalid answer repairs once then falls back; the plan's 2 credits are spent before and refunded on failure.
- **Rules:** chat documents (task 4).
- **E2E (Playwright):** demo project → AI panel empty state → click "Add an opening title at 0:00" → plan card → Apply all → ✓, action card "Updated 1 slot", a new slot on the timeline → Undo → slot gone → Redo; typed message with a stubbed cloud provider (`?ai=fake`) → plan → Apply all → one ⌘Z restores everything.
- **Design check:** Chrome DevTools MCP on both PNGs (task 13).

### Correctness properties (fast-check)

1. **Enforcement soundness:** for any project and any raw model output (random actions, refs, choices, words), every step of `enforcePipPlan` refers to an existing slot, a known style, format, caption value or component; ≤ 8 steps, ≤ 6 generations; total = Σ step credits.
2. **Enforcement is a filter:** each kept step comes from one raw step (same action, resolved values), in the same order; `dropped.length + steps.length = raw.length`.
3. **One undo:** for any project and any enforced plan applied by `runPlan` with fake deps (random step failures), a single `undo` per created entry returns exactly the pre-apply project, and with no interleaved edits exactly one entry is created.
4. **Invariants:** any applied plan, with random user commands interleaved between steps, keeps the timeline invariants (editor-timeline.md 1–3).
5. **amendTop:** for random command sequences, `undo(amendTop(h, p, top, next))` equals `undo(h, p)` state-wise.
6. **Route honesty:** `pipRoute` never returns `device` when Nano is unavailable or the prompt is over budget, never `cloud` when offline or under the kill switch, and the hint is `free` exactly when the mode is `code` or `device` (or the waiting plan costs 0).
7. **No surprise spend:** with fake credits, the sum of `spend` minus `refund` equals the credits of landed paid steps plus 2 per cloud plan, never more than the estimate shown before Apply all.

## 12. Proposed steering changes (to apply from the IDE)

The headless agent may not write `.kiro/steering/`:

1. `ai-tasks.md` §6 `pip.plan`: mode becomes "code chooses: ONLY_ON_DEVICE for slot-scoped requests that fit the device budget, else ONLY_IN_CLOUD; suggestion chips are planned in code"; output becomes `{ reply, steps: { action, slot, choice, atWord, instruction, label }[] ≤ 8 }` with sentinels, and "credits are computed by code"; execution: "steps land one by one, amending one history entry".
2. `data-model.md`: the chat document shape from §2 (`threadId`, `plan`, `planState`, `stepStates`, `result`, integer `createdAt`).
3. `editor-timeline.md` "State and commands": add `SetSlotStyle`, `ApplyGenerated` and "ApplyPlan lands step by step through `amendTop`, one undo entry".
