# Requirements: 10 Pip panel

_Written headlessly in Kiro CLI (agent `motionpop-builder`, model claude-opus-5.5) on 2026-11-16, overnight, while the founder was asleep. Decisions taken without asking are in `design.md` §0 and D-035 in `docs/decisions.md`. Not yet approved by the founder._

The editor's rail item **AI** opens the Pip panel: a whole-video assistant. You ask Pip for one graphic or a change across the video, Pip answers with a plan, and **Apply all** carries it out as one undoable step, with an action card that can undo it again. It is the cloud half of the hybrid story (multi-turn reasoning runs in the cloud; Gemini Nano is single-turn), with honest exceptions that stay free and on the device. Lands by **Tue Nov 24, 2026** (plan §5).

Visual source of truth: `design/screens/pip-empty.png` and `pip-conversation.png` (2× exports, 1440×900 frames), CSS frames "Motionpop · Pip · Empty state" (line 80671) and "Motionpop · Pip · Conversation" (line 93113) in `design/figma-export.css`. Behaviour from `screens.md` (Pip panel), `hybrid-ai.md`, `ai-tasks.md` §6, `editor-timeline.md` (commands, composite, history), `pip-mascot.md`, `data-model.md` (chat) and `security-and-cost.md`.

**Reused, not re-specified:** the editor store, commands, `composite` and history (spec 04), the router, `edit.patch`, `component.fill` with gates and safe defaults (specs 00, 06, 07), slot display names (`lib/editor/slot-display.ts`), Pip and the UI primitives (spec 02), the rail and `PipDock` (spec 04).

**Out of scope:** the credit ledger and its spend/refund route (spec 13; this spec calls its contract), brand kits (spec 16), caption translation, image attachments (spec 07 tasks 25–26), voice input. See **Later** in `tasks.md`.

---

## R1 Left panel container
_As a creator, I want side tools that open and close without hiding my timeline._
1. **R1.1** WHEN the user picks a rail item THE SYSTEM SHALL open a 340 px left panel between the rail and the preview (x 72, from below the top bar to the timeline), sliding and fading in over 240 ms. The preview SHALL shrink to fit; the inspector and the timeline SHALL stay where they are.
2. **R1.2** WHEN the user clicks the collapse chevron on the panel's right edge, presses Escape inside the panel, or clicks the active rail item again THE SYSTEM SHALL close the panel and return focus to the rail item.
3. **R1.3** WHERE a rail item's panel is not built yet THE SYSTEM SHALL show a "coming soon" panel in the same language (Pip, the panel name, one line on what it will do), never a dead click and never a toast-only answer.
4. **R1.4** THE SYSTEM SHALL remember the open panel per browser and open the AI panel by default.

## R2 Empty state
_As a creator who opens the panel for the first time, I want to know what Pip can do._
1. **R2.1** WHEN the conversation is empty THE SYSTEM SHALL show the header "Pip ▾", the "Style" pill and "+", Pip in a glowing orb, "What should we make move?", "I can see your whole timeline. Ask for one graphic or change the whole video.", the suggestion chips, the scope chips, the composer and the route hint, as in `pip-empty.png`.
2. **R2.2** THE SYSTEM SHALL show these suggestion chips: "Fill the {n} empty slots" (only when n ≥ 1; "Fill the empty slot" when n = 1), "Use brand colours everywhere", "Add an opening title at 0:00" (only when no slot starts in the first second), "Tighten graphics to match my pace", "Translate captions to German".
3. **R2.3** WHEN the user clicks a suggestion chip THE SYSTEM SHALL send it as a message.

## R3 Scope and composer
_As a creator, I want to say whether I mean one graphic or the whole video, and see what it costs before I send._
1. **R3.1** THE SYSTEM SHALL show the scope chips "Whole video" and "@Slot {k} · {Component}" (only while a slot is selected), with the active one in violet. Selecting a slot on the timeline SHALL offer its chip; the active scope SHALL stay "Whole video" until the user picks the slot chip.
2. **R3.2** THE SYSTEM SHALL show the composer: "Ask Pip anything…" (multi-line, Enter sends, Shift+Enter breaks the line), attach, mic, the "Style" chip and the ember send button. Attach and mic SHALL say what they will do when they arrive, as tooltips, and do nothing else.
3. **R3.3** WHEN the user picks a style from the composer's "Style" chip THE SYSTEM SHALL add "in the {Style name} style" to the message. WHEN the user picks one from the header "Style" pill THE SYSTEM SHALL change the video's style at once (one undoable command).
4. **R3.4** THE SYSTEM SHALL show, under the composer and before anything is sent, the route hint for the next action: the mint "⚡ free · on-device" or the violet "☁ ~{n} credits", or "Needs connection" when nothing can run. The hint SHALL update as the user types, changes scope, or a plan is waiting to be applied (then it shows that plan's cost).
5. **R3.5** WHEN the message is empty and no plan is waiting THE SYSTEM SHALL show "⚡ free · on-device", because nothing will be charged until a message needs the cloud.

## R4 Planning (`pip.plan`)
_As a creator, I want Pip to understand the whole video and propose concrete changes._
1. **R4.1** WHEN the user sends a typed message THE SYSTEM SHALL run `pip.plan` through the `packages/ai` router with a compact project summary (format, style, captions, the slots with their names, reasons, status and times, the words, the scope and the last 3 turns), parse the answer with zod, enforce it in code (R4.4), and show Pip's reply.
2. **R4.2** THE SYSTEM SHALL route a typed message on the device (ONLY_ON_DEVICE, free) WHEN the scope is one slot, Gemini Nano is available and the prompt fits the on-device budget; otherwise in the cloud (ONLY_IN_CLOUD, 2 credits), as the hint said before sending. Offline, a message that fits on the device SHALL run there whatever its scope.
3. **R4.3** WHEN the user sends a suggestion chip THE SYSTEM SHALL build the plan in code on the device, free and instant, without calling a model.
4. **R4.4** THE SYSTEM SHALL enforce every plan: only known slots, styles, formats, caption presets and components; at most 8 steps and at most 6 generations; no step on a slot that an earlier step removes; addSlot only at a word that is not inside a slot; each step's cost and the plan's total computed by code, never taken from the model; a code-written label where the model's is missing or longer than 60 characters. Steps that fail are dropped with a reason shown in the plan card.
5. **R4.5** IF the model's answer is invalid after one repair THEN THE SYSTEM SHALL refund the plan's credits and try the code-built plan for the message; IF there is none THEN Pip SHALL say "I couldn't plan that one. Try asking for one change at a time." with nothing charged.
6. **R4.6** WHEN a request needs something Motionpop can't do yet (caption translation, brand colours without a brand kit) THE SYSTEM SHALL answer with a short honest reply and no steps.
7. **R4.7** WHILE Pip is planning THE SYSTEM SHALL show Pip thinking in the panel and in the rail bubble ("Pip is thinking…"), and SHALL keep the composer usable for drafting.

## R5 Plan card and Apply all
_As a creator, I want to see the plan, change it, and apply it with one click and one undo._
1. **R5.1** THE SYSTEM SHALL show the user's message card, "Pip  {reply}" ("Here's the plan" for plans) and the plan card with numbered steps, "Apply all" (violet) and "Edit plan", as in `pip-conversation.png`.
2. **R5.2** WHEN the user clicks "Edit plan" THE SYSTEM SHALL let them include or leave out each step, recompute the cost, and return with "Done".
3. **R5.3** WHEN the user clicks "Apply all" THE SYSTEM SHALL check the balance against the plan's cost first (out of credits → the spec 13 modal, nothing applied), then carry out the steps in order. Each step SHALL show "…in progress" while it runs and a mint ✓ when it lands; a step that can't land SHALL show "Skipped · {reason}".
4. **R5.4** THE SYSTEM SHALL land each step in the editor as soon as it is ready, and the whole plan SHALL always be one entry in the undo history.
5. **R5.5** Each step SHALL map to an editor command: updateSlot → a params patch from `edit.patch` (device first; the cloud fallback costs 1 credit and is included in the estimate); generateSlot → a cloud `component.fill` (3 credits, a new version with source `plan`); addSlot → a new slot at the word, filled on the device or by the scene's safe default; removeSlot → delete; setStyle → video or slot style; setCaptions → captions on, off or a preset (spec 12); setFormat → format.
6. **R5.6** IF the user's own edits make a step impossible while the plan applies THEN THE SYSTEM SHALL skip that step with the reason and keep the user's edit.
7. **R5.7** WHILE a plan applies THE SYSTEM SHALL warn before the page unloads.

## R6 Action card
_As a creator, I want to see what changed and undo it in one click._
1. **R6.1** WHEN the first step of a plan lands THE SYSTEM SHALL show the action card "Updated {n} slots" (or "Changed the format", "Changed the style", "Turned captions on" when no slot changed) with thumbnails of the changed slots, "Undo" and "View on timeline", updating as more steps land.
2. **R6.2** WHEN the user clicks "Undo" THE SYSTEM SHALL stop the plan if it is still applying and undo all of it in one step; the card SHALL then read "Undid {n} slots" with "Redo". IF later edits sit on top of the plan in the history THEN "Undo" SHALL be disabled with the hint "Undo your later edits first (⌘Z)".
3. **R6.3** WHEN the user clicks "View on timeline" THE SYSTEM SHALL select the first changed slot, scroll the timeline to it and pulse its card once.
4. **R6.4** Credits spent on steps that landed SHALL NOT be refunded by Undo; the action card SHALL say so in its tooltip.

## R7 Conversation persistence
_As a creator, I want to come back to my conversation with Pip._
1. **R7.1** THE SYSTEM SHALL store every message (and its plan and plan state) in `projects/{id}/chat/{messageId}` when signed in, and in IndexedDB in local mode, parsed with zod on read.
2. **R7.2** WHEN the user clicks "+" or picks "New conversation" from "Pip ▾" THE SYSTEM SHALL start a new thread; "Clear this conversation" SHALL ask first, then delete the thread's messages.
3. **R7.3** WHEN the editor reloads THE SYSTEM SHALL show the last thread; a plan that was applying SHALL show "Stopped" and the action card's Undo SHALL be disabled with "Undo history resets when you reload".
4. **R7.4** Firestore rules SHALL allow chat documents only to the project's owner and SHALL reject an unknown role or a text over 2,000 characters, covered by rules tests.

## R8 Routing, cost and safety
1. **R8.1** Every model call SHALL go through the router, record its usage event (`ranOn`, model, latency, credits) and validate its output with zod.
2. **R8.2** A cloud plan SHALL spend 2 credits through the spec 13 contract before the call and refund them if the call fails; each generation SHALL spend 3 credits before its call and refund on failure.
3. **R8.3** WHEN the kill switch is on THE SYSTEM SHALL keep device and code-built plans working and disable cloud sends with "Pip is resting. Small edits still work."
4. **R8.4** WHEN the browser is offline THE SYSTEM SHALL disable cloud sends and generation steps with "Needs connection" and keep device and code-built plans working.
5. **R8.5** No user text SHALL be logged by the app beyond the stored conversation; prompts SHALL never contain secrets.

## R9 Quality
1. **R9.1** The empty and conversation states SHALL match their PNGs at 1440×900, checked with the Chrome DevTools MCP.
2. **R9.2** The message list SHALL be a polite live region; every control SHALL be keyboard reachable with the violet focus ring; `prefers-reduced-motion` SHALL turn off the orb glow pulse, Pip's float and the chip pop-in.
3. **R9.3** The panel SHALL open in under 100 ms and a code-built plan SHALL appear in under 50 ms on the demo project.
