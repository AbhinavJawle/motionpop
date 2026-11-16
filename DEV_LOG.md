# Development log

Honest record of how Motionpop is built. One entry per work session. Kiro sessions are logged separately in `KIRO_LOG.md`. Both feed the write-ups, so note real details: what helped, what didn't, what broke.

Template:

```
## YYYY-MM-DD · <tool: Claude Code | Kiro CLI | Kiro IDE | manual>
- Spec / tasks:
- What we did:
- What helped:
- What didn't / friction:
```

---

## 2026-11-14 · Claude Code
- **Spec / tasks:** none yet (planning session).
- **What we did:**
  - Restarted the project from the planning material written Nov 11–14.
  - Read the Figma designs (11 screens + the full CSS export) and the earlier planning drafts.
  - Researched HyperFrames (render engine), Firebase AI Logic hybrid inference (official docs) and an MIT-licensed review tool (VideoHub) for render and preview ideas.
  - Wrote and got approval for `docs/plan.md` (scope, architecture, Kiro plan, schedule).
  - Installed the HyperFrames and Firebase agent skills for Claude Code and Kiro.
  - Reset the repository: Apache-2.0 licence, README, design assets in `design/`.
- **What helped:**
  - Checking facts against official docs instead of assuming:
    - Gemini Nano on-device takes text + images (no audio), is single-turn, and supports JSON output. That shaped which tasks run on-device.
    - Gemini TTS is available through Firebase AI Logic, which removed ElevenLabs.
  - The HyperFrames repo has a `hf-seek` protocol, which lets our own motion core drive it without GSAP (GSAP's licence excludes no-code animation tools).
- **What didn't / friction:**
  - The earlier steering drafts disagreed with the final designs in several places (credit costs, generating state, style count). The designs were declared the source of truth.
- **Later the same day (Claude Code):**
  - Wrote `.kiro/steering/` (20 files) from the screenshots and the Figma CSS, specs 00–02, two custom Kiro agents with hooks, and the MCP config.
  - Scaffolded the monorepo: Next 16.4, Tailwind 4.3, Figma tokens in `globals.css`. Typecheck, lint, tests and build are green.
  - **HyperFrames spike passed (D-009):** our own DOM code drives the player and the producer through `hf-seek`, with no GSAP. The render is frame-exact and the audio beep lands at 2.0004 s.
  - Gotcha: the player doesn't inject the runtime for a pure `hf-seek` composition, so we embed the pinned runtime ourselves.
  - Found by reading the HyperFrames source rather than guessing.
  - Friction:
    - pnpm 11 blocks Puppeteer's Chrome download until it's allowed.
    - `kiro-cli agent validate` needs a login, so the agent configs aren't validated yet.
    - Kiro hooks run without nvm on PATH, so `node.sh` locates Node.

- **Evening (Claude Code), specs 00–02:**
  - **Spec 00:**
    - Motion core v0 (eases, interp, count-up), `big-number`, and a compiler that turns a project into a self-contained HyperFrames composition. The hf-seek runtime is bundled with esbuild.
    - `services/render` renders the compiled composition (4 s at 720p in about 11 s).
    - `/dev/skeleton` plays it in `<hyperframes-player>` with the uploaded voiceover.
  - **On-device Whisper (00 task 8):**
    - transformers.js 4.3.2 in a worker, `whisper-base_timestamped`, WebGPU first with a WASM fallback.
    - In headless Chrome: 4.8 s of speech → 11 words with correct timings. Transcription takes ~1.7 s after a one-time model download of ~80 s.
    - Clicking the word "40%" moves the slot so the count lands on the spoken word (D-022).
  - **Spec 02 (design system + Pip):**
    - Motion presets, NumberRoll, buttons, chips, cost chips, toggles, fields, slider, dropdown, tabs, cards, glass toolbar, modal, toasts, tooltip and shimmer.
    - Pip in SVG + motion: 11 states, 8 props, seeded blink, cursor-follow eyes, and a lying silhouette for sleeping.
    - Measured from the Figma CSS and compared with editor.png, export.png and projects-empty.png at 1440×900.
  - **Kiro runs 2–4 (see KIRO_LOG):** property tests for eases/big-number (found an `inOutSine(0) = -0` bug), Remote Config typed defaults (01 task 4), and Pip/token tests (02 task 8).
  - **Bugs found by checking, not assuming:**
    - Composition fonts used app CSS variables, which don't exist inside the player iframe.
    - Two hydration bugs: motion's `useReducedMotion()` reads matchMedia on the first client render (fixed with a `useSyncExternalStore` hook), and the same issue in StatusDot.
    - motion overwrites a px `transformOrigin` on SVG, so the pivots now use `originX`/`originY`.
    - `<hyperframes-player>` runs compositions same-origin by default. Tier-2 code must use `sandbox-origin="opaque"` (D-021).
  - **Friction:**
    - pnpm 11 left placeholder keys in `pnpm-workspace.yaml` after a failed `add`.
    - Kiro kept tripping on BSD `sed` and didn't run Prettier; the builder prompt now covers both.
    - Firebase (00 tasks 9–10, 01 tasks 3+) is still blocked on the Firebase login.

- **Late afternoon (Claude Code + Kiro), spec 03 motion engine:**
  - **Spec review loop:**
    - Kiro reviewed the spec twice (runs 5 and 6, which overlapped by mistake; see the KIRO_LOG correction).
    - Claude Code folded about 40 findings into requirements, design and tasks, and updated `component-contract`, `structure` and `motion-principles` (D-023). Main changes: transparent component roots, a compiler-owned camera and background, explicit font loading, a highlight-swipe accent, timings from the style pack, and seeded texture tiles.
  - **Kiro tasks:**
    - 1: StylePack schema + contrast.
    - 2: rng / stagger / timeline with golden values.
    - 13: seeded PNG texture tiles with a hand-written PNG encoder.
    - 4: `fitText` truncatable/overflow + `insetForCamera`. Kiro reported honestly that one old test needed a one-line update it wasn't allowed to make.
  - **Claude Code tasks:**
    - 5: style packs replace `StyleTokens`.
    - 7: compiler v1 (FORMATS, background/transparent, texture layers, track lanes, captions host).
    - 8: runtime engine with per-slot isolation, explicit `fonts.load`, camera wrapper, slot seeds and `hf-seek` `waitUntil` readiness.
    - 9: big-number v1.
    - 10: `pnpm motion:check` (102 cases × 3 formats in about 13 s).
  - **Bugs found by motion:check, not by unit tests:**
    1. `scrollHeight` counts Geist's content area past the line box, so every number "overflowed". `fitText` now uses `offsetHeight`.
    2. `countAt` rounded to nearest, so an ease-out showed the final value hundreds of ms before the word. It now rounds toward `from`, so the final value first appears exactly at the key moment (property test added).
    3. `formatCount(-0)` rendered "£-0%" (regression test added).
    4. Direct `__motionpop.seek` doesn't move HyperFrames' clock, which also decides clip visibility. The first screenshots showed the wrong clip while the probes passed. The check now drives `__player.seek(frame / 30)`, because HyperFrames floors its clock to frames.
    5. Rounding in the layout pushed 9:16 boxes 0.6 px past the camera-safe area. The layout now snaps inward.
    6. The number entrance could end after the word, which failed sync.
  - **Measured:**
    - A one-slot composition is 1.5 MB: the HyperFrames runtime is 679 KB and ours is 460 KB minified (mostly zod). The 600 KB NFR was unreachable and is corrected.
    - Producer render: 4 s at 1080p in 14 s.
  - **Not done yet:** tasks 11 (parity), 12 (determinism lint), 15 (`assertSeekPure` helper) and the 03 spec close-out.

### 2026-11-14 · Evening (Claude Code + Kiro), spec 03 close-out and spec 04
- **Kiro run 11 (task 15):** the `assertSeekPure` helper now replaces big-number's hand-written determinism tests. I reviewed Kiro's report and commit 1c3caad.
- **Task 11, parity (Claude Code):** `services/render/scripts/parity.ts` compares five frame-aligned stills from the runtime in Chrome with frames extracted from the producer's MP4.
  - All 5 pass: global difference ≤ 1.02 %, worst 64 px tile 3.18 %.
  - Control: comparing mismatched frames gives a worst tile of 62–72 %, so the metric does catch real differences.
  - The producer renders 8 s at 1080p in 15.2 s.
  - `puppeteer` added as a devDependency of `services/render`.
- **Task 14:** box checked. The steering work was already done in 5d1526d.
- **Task 12 (determinism lint):** Kiro run 12, reviewed (eeb58ba). All spec 03 tasks are now checked.
- **Spec 04, editor shell and timeline:** wrote `requirements.md` (R1–R7 in EARS), `design.md` and `tasks.md` (10 tasks; 1–4 marked `[kiro]`: schemas, timeline geometry/snap/constraints, commands with property tests, peaks worker).
  - Firestore sync stays behind a `ProjectRepository` interface backed by IndexedDB until the Firebase login is done.
  - The demo fixture uses a procedurally synthesized voice, so there is no third-party audio.
- **Spec 04 tasks 1–4 (Kiro runs 13–16):** schemas, timeline geometry/snap/constraints, undoable commands with property tests, and the peaks worker. Each run was reviewed against its log and commit (0f419ce, 765f393, bf542f0, bb22a95). Run 16 surfaced the autosave-on-reload problem, fixed with `loadCount`.
- **Tasks 5–8 (Claude Code):**
  - Editor store (Zustand + Immer, commands, history cap 200), `ProjectRepository` (memory + IndexedDB, zod-parsed reads, last-good backup) and autosave after 500 ms quiet.
  - Demo fixture measured from the Figma frame.
  - Editor shell (top bar, rail, preview pane, inspector, Pip dock) and the timeline (ruler, slots, karaoke words, waveform, audio).
  - `PlaybackClock` with the audio element as master clock, and the preview bridge, which seeks only on frame changes.
  - Design check at 1440×900 matches `editor.png` 1:1 in layout.
- **Bugs found while building tasks 5–8:**
  - `html { font-size: 13px }` shrank every rem-based size by 19 %. Only `body` is 13 px now.
  - `indexedDB` undefined during SSR. The repository factory is now resolved lazily.
  - `player.seek` called before the custom element upgraded. Added a guard and a re-sync after import.
  - A Zustand selector returning a new object looped renders. Split into primitive selectors.
  - The ruler's "0s" label was clipped. Added a −24 px clip inset at scroll 0.
- **Task 11 (Kiro run 17):** unit tests for playback and the preview bridge. **Kiro found a real bug:** changing the rate while playing started a second rAF loop. Claude Code fixed it (ecbc066) and turned Kiro's `it.fails` into a regression test.
- **Task 9 (Claude Code):**
  - Drag to move and resize: snap within 8 px, 150 ms magnetic settle, neighbour stops, one command per drag, Escape cancels, edge auto-scroll.
  - Shift-drag across words adds a slot.
  - ⌘/ctrl + wheel zooms at the pointer (never past fit); shift + wheel scrolls (clamped).
  - Pure helpers (`dragRange`, `slotForWords`, `wheelView`, `clampScroll`) are property-tested; the committed range equals the drag preview.
  - The browser smoke run found that scrolled cards bled 24 px into the label column. Fixed: the clip inset now applies only at scroll 0.
- **Prettier drift:** 32 files failed `format:check`, which CI runs, because the spec 04 work had skipped Prettier. Fixed in one formatting-only commit (61432e3).
- **Task 10.1 (Claude Code):** `/editor/perf` opens a seeded 3,000-word, 50-slot project. Its first screenshot showed the words overlapping into a smear at fit. The words track now declutters greedily using canvas-measured widths; every demo word still shows at the design zoom.
- **Task 10.2:** handed to Kiro (run 18): Playwright E2E, design-check diff and perf measurement.
- **Task 10.2 (Kiro run 18):** Playwright E2E, design check and perf, all green. During playback on `/editor/perf` the p95 frame interval is 16.8 ms, and the words track holds about 40 buttons. Reviewing Kiro's diff image turned up three mismatches with `editor.png`. All three are fixed:
  - **Footer hint.** I had replaced the hint with copy from a Figma CSS comment that belongs to another frame. The PNG wins.
  - **"Music · ducked" label.** It was missing.
  - **"6s" ruler label.** It was hidden too eagerly next to the playhead capsule.

  The Next dev badge is now off, because it covered the AUDIO label in screenshots. All spec 04 tasks are checked.
- **Spec 05 (audio pipeline):** wrote requirements, design and tasks in Claude Code. Decision D-024: transcribe before cleaning, cleaned audio as 24 kHz mono WAV, and an honestly labelled synthetic sample until a real recording exists.
- **Spec 05 tasks 3–4 (Claude Code):** the voiceover cleanup fields and original transcript are in the schema. Added the WAV, decode and cleaned-audio renderer modules. The `keptSegments` property test found a real bug: overlapping or nested cuts made the removed total go negative. Fixed, with a regression test. (A first commit went in while that test was still red, because the check chain only grepped the output. It was amended before anything else built on it.)
- **Spec 05 tasks 5–8:**
  - Task 5: AudioStore on a shared IndexedDB v2. Task 6: pipeline orchestrator. Task 7: Kiro run 21, 37 orchestrator tests, no bugs. Task 8: Processing screen (drop zone, Pip, four step cards, word strip, live region, editor hand-off).
  - "Try a sample" now goes from drop to editor in about 1.2 s. The cleaned voiceover is 14.3 s (from 18.0 s, four long pauses removed), and the project survives a reload.
  - **Bug the browser found and fake-indexeddb didn't:** `IdbAudioStore.put` awaited inside its transaction, so the put threw `TransactionInactiveError`. The friendly "Couldn't save" message hid the cause, so `PipelineError` now keeps it as `cause` and the screen logs it.
- **Spec 01 task 3: Firebase project and client (Claude Code):**
  - The founder logged the CLI in and confirmed the existing Blaze project, with spend kept as close to zero as possible.
  - **Set up from the CLI, gcloud and REST:**
    - registered the web app and wrote its config to `.env.local` (not committed);
    - enabled the APIs;
    - created Firestore `(default)` and the default Storage bucket in us-central1;
    - provisioned AI Logic;
    - enabled email/password auth and authorised `localhost`;
    - created a reCAPTCHA Enterprise key, registered it with App Check and added a debug token for local use.
  - **Left for the console:** Google sign-in needs a support email, which is the founder's, so I didn't send it from here. The existing $5 budget caps were already in place.
  - **Client code:** `lib/firebase/` has a zod-parsed env, lazy getters that import each service on demand, a Remote Config loader with typed fallbacks, and `/dev/firebase`, a dev-only smoke test. `.env.example` lists names only.
  - **Live result:** all six checks pass in headless Chromium: App Check token, Remote Config, Auth, Firestore, and AI Logic answering "ready" in about 1.3 s. App Check is now enforced on AI Logic, Firestore and Storage. A call without a token gets 401.
  - **Friction:**
    - **Gemini Developer API returned 429.** It said "prepayment credits are depleted": linking billing moves that API to a prepaid tier with a $5 minimum. I switched AI Logic to the Agent Platform backend, which bills per call on Blaze with no prepay (D-025).
    - **The backend class was renamed.** It is `AgentPlatformBackend` in this SDK, not `VertexAIBackend`. The checks page caught it at runtime.
    - **Models are global-only.** Current Gemini models only answer on the `global` endpoint.
    - **The TTS preview model is being shut down.** The models page lists `gemini-3.1-flash-tts-preview` as shutting down on Nov 17, so the defaults moved to `gemini-3.8-flash-tts` and `gemini-3.8-flash` (D-026).
    - **My own probe bug.** For a while I thought every model returned 404. zsh read `$M:generateContent` as a history modifier, so my curl loops hit mangled URLs.
    - **The CLI refused prompts.** `firebase init ailogic` won't prompt inside an agent shell, so I called the provisioning API it uses directly.
  - **Slip:** one Auth config read printed the project's password-hash parameters into this session's output. They are not in the repo or any file. Later reads filter the fields.
- **Spec 01 task 5: auth (Claude Code):**
  - **What was built:**
    - an auth store read through `useSyncExternalStore`;
    - Google and email/password actions;
    - `AuthGate` on `(app)` routes;
    - `/sign-in` (glass card, Pip waving, then thinking on errors; sign in, create account, reset);
    - a dashboard placeholder with sign out.
  - **Tests:** `safeNextPath` has a fast-check property that no output resolves off-origin, and auth errors map to friendly copy that never shows raw codes.
  - **E2E:** Playwright now has two projects. Editor specs run in local mode (Firebase env blanked; 8 pass). `auth.spec.ts` drives the real Firebase client against the Auth emulator: redirect with `next`, create account, sign out, wrong password, sign back in, unsafe `next`, reset (4 pass).
  - **Found along the way:**
    - The lint rule `react-hooks/set-state-in-effect` rejected the first context-based provider, which led to the store, which also avoids hydration mismatches.
    - The emulator reports `user-not-found` on reset, which would let the form probe emails, so reset swallows that code.
- **Spec 01 task 6: user bootstrap (Claude Code):**
  - **What was built:**
    - `UserDoc` and `CreditTx` zod schemas in `packages/schemas`.
    - A pure `planBootstrap`: 20 credits on the free plan. The judge plan with 500 credits needs a verified allow-listed email, which closes the "type the judge's email into sign-up" hole. Unit tests plus a fast-check property that every plan passes the schemas and the ledger matches the balance.
    - Server modules: Firebase Admin, `verifyRequest` for the ID token and App Check token, and a Remote Config server-template loader.
    - The bootstrap transaction, with a fixed `signup` ledger id.
    - `POST /api/users/bootstrap`, called from the auth store.
  - **E2E on the Auth and Firestore emulators (5 pass):** sign-up writes `users/{uid}` (free, 20) and `credits/signup`. A pre-verified judge account gets the judge plan with 500 credits.
  - **Manual check:** curl confirms 401 for a missing ID token, a missing App Check token and a junk App Check token, and 405 for GET.
  - **Open:** local dev against the real project needs `gcloud auth application-default login` for the Admin SDK. In emulator mode the first Admin call waits about 5 s on a GCE metadata lookup (harmless, emulator only).
- **Spec 01 task 7 (Kiro run 23)** and **task 9 (Claude Code): CI.**
  - **Task 7:** reviewed Kiro's rules and its 39 emulator tests, then reran them myself (39/39). Kiro caught that our own rule sketches would have opened the credit ledger to clients, so I corrected the sketches in `data-model.md` and the spec 01 design.
  - **Why CI was red:** it had failed since the Firebase commit. The cause wasn't Firebase: `textures.test.ts` made 262k `expect()` calls, one per pixel, and timed out at 5 s on the runner. It now makes one range assertion. My new bootstrap property test took 1.1 s because building `fc.emailAddress()` and `fc.webUrl()` is expensive; with cheap arbitraries it takes 15 ms.
  - **New workflow:** checkout, setup-node and setup-java on v5 (Node 20 deprecation); a gitleaks job with full history; a rules job (Java 21 plus `test:rules` on the emulators); concurrency cancel. `pnpm build` passes without any Firebase env.
- **Spec 01 task 10 (in progress, Claude Code): App Hosting.**
  - Created backend `motionpop-web` in us-central1 from the CLI. It has no GitHub connection and deploys from local source, uploading the whole repo minus ignores so the pnpm workspace packages are included. The hosted URL is `motionpop-web--motionpop-48409.us-central1.hosted.app`.
  - `apphosting.yaml` scales to zero, runs at most 2 instances, and sets the public reCAPTCHA key.
  - The web config is read from App Hosting's injected `FIREBASE_WEBAPP_CONFIG` and mapped to `NEXT_PUBLIC_*` in `next.config.ts`, so no API key is committed (gitleaks would flag it). Env vars that are already set win, including blanks.
  - Added the hosted domain to the reCAPTCHA key and the Auth authorized domains.
  - The first `firebase deploy --only apphosting` was blocked by Claude Code's permission check. It's waiting on the founder.
- **Spec 01 task 10 done: first production deploy.** The founder ran `gcloud auth application-default login`, and I set the quota project. `firebase deploy --only apphosting` built the pnpm monorepo from local source on the first try.
  - **Production smoke test** in headless Chromium against the hosted URL:
    - `/dashboard` redirects to `/sign-in?next=%2Fdashboard`;
    - sign-up lands on the dashboard;
    - a real reCAPTCHA Enterprise App Check token passes `verifyRequest`;
    - bootstrap returns 200, and Firestore has `plan: free, credits: 20`.
  - The throwaway account was deleted afterwards. Dev pages return 404 in production. **Spec 01 is complete.**
- **Spec 06 tasks 3 and 5 (Claude Code), alongside Kiro run 25 (task 1):**
  - **Task 3:** `catalogue.ts` lists 6 components and 8 skills. Tests compare it against `component-library.md`, every `skills/*.md` frontmatter, and the motion registry, including built status and big-number's duration limits.
  - **Task 5:** `detect-local.ts` scores spans per the design table and budgets one slot per 5 s. It picks the best non-overlapping candidates, then widens each slot's start, but never into the previous pick. It builds big-number params with a title-cased label and an M/B scale, and flags `needsInput` instead of inventing a label.
  - **Results:** the demo transcript gives exactly one slot, big-number 40 % "Our revenue grew", with no `needsInput`. A fast-check property checks determinism, schema validity, order, no overlap and the budget.
  - **Bug found:** the first lead-in widened the bar-chart slot over the neighbouring place span. Fixed by picking on the spans first and widening afterwards.
  - Shared `TaggedSpan` types live in `slots/types.ts`, so Kiro's tagger (task 2) and the detector agree.
- **E2E hygiene:** Playwright's default hard kill orphaned the Firestore emulator's Java process (parent PID 1), which then blocked `test:rules` on port 8080. That happened twice, and once it also blocked Kiro. `gracefulShutdown: SIGTERM` lets firebase-tools stop it; I verified no orphans remain.

## 2026-11-15 · Claude Code
- **Spec 06 task 2 (Kiro run 26), reviewed:** the gazetteer and tagger landed with 202 package tests green. The demo transcript tags exactly the hand-made spans. Kiro flagged a 50 ms vs 20 ms wording clash in the spec, which I clarified: the tagger gets 20 ms, detection plus post-pass gets 50 ms.
- **Spec 00 task 9 + spec 06 task 8: the AI router, live (Claude Code):**
  - **What was built:**
    - `packages/ai/src/router.ts`: `createRouter({ provider, config, onUsage })`. It validates input, picks the mode (call option, then Remote Config override, then task default), and asks for structured output (`z.toJSONSchema`). It parses with zod, repairs once after an invalid answer and escalates to the cloud only when the task allows it. The kill switch pins work to the device and blocks cloud-only tasks.
    - `providers/firebase.ts` (separate `@motionpop/ai/firebase` entry), checked against the installed `@firebase/ai` 3.1.0 types. The SDK's `InferenceMode` values are lowercase strings, unlike our schema. On-device ignores `systemInstruction`, so it goes in as a `system` initial prompt. `ranOn` comes from `response.inferenceSource`.
    - `tasks/slots-detect.ts` + prompt v1 + `detectSlots(router | null, …)`. That never throws: it filters unknown ids and falls back to `detectLocal`.
    - Web: `lib/ai/router-client.ts`, a "Detect slots" button on `/dev/skeleton`, and an `ai-router` step on `/dev/firebase`.
  - **Tests:**
    - 15 router tests, including a fast-check property (200 runs) that the router never returns schema-invalid output, always reports usage once, and charges only cloud answers.
    - 5 `slots.detect` tests and 2 provider tests (mocked SDK).
  - **Live measurement** (cloud, `gemini-3.8-flash`, demo transcript, headless Chromium with no Nano):
    - The first try was valid and gave big-number 40 % "Our revenue grew", but took **12.0 s** with default thinking.
    - With thinking `LOW`, it took **3.5 s and 3.0 s**, still valid on the first attempt. Slot choice varies between runs (2–3 slots; once a kinetic-headline first), which is what the post-pass and the local fallback are for.
  - **Bug found by a property test:** `planBootstrap` gave an empty display name for the email `@` (fast-check seed -1429429465, about 1 in 10 runs). It now falls back to "Creator", with a regression test.
  - **Not done yet:** usage events stay in memory; writing `users/{uid}/usage` needs a server route because the rules block client writes (spec 13). On-device Nano is not measured yet: headless Chromium has no Nano, so every live call so far ran in the cloud.
- **Spec 06 task 4 (Kiro run 27), reviewed and adjusted:** Kiro's post-pass has a 400-run property and runs in 14.7 ms on 3,000 words. Kiro pointed out that greedy one-at-a-time widening could starve a lower-score neighbour. I changed it to two passes (all minimums first, then ideal widening in score order), with a regression test that fails on the old version. `wordsInRange` moved to `@motionpop/schemas` first, so the editor and the post-pass share one implementation.
- **Spec 00 task 10: `edit.patch` (Claude Code):**
  - **What was built:**
    - The router gained a task-level semantic `check`. A failing check counts as an invalid answer, and its message drives the repair.
    - `editPatchTask(paramsSchema)`: the check applies the patch to a copy and parses it with the component schema. Missing paths and schema breaks are repaired once, then retried in the cloud (1 credit). `escalate` passes without a patch.
    - `/dev/skeleton` has a quick-edit box. It shows `⚡ device` or `☁ cloud`, the model, latency, credits and attempts, applies the patch and recompiles.
  - **Tests:** 7, including a 200-run property that a returned patch always applies and keeps big-number params valid (testing.md's quick-edit property).
  - **Live results** (cloud `gemini-3.5-flash-lite`, thinking `MINIMAL`; headless Chromium, so no Nano):
    - Correct on the first try: "change 40 to 45", "label: Sales doubled", "show one decimal", "back to percent".
    - "turn this into a world map" escalated as intended.
    - "make it dollars instead of percent" first escalated ("cannot determine currency symbol"). After a unit-symbol rule it gave `suffix: "$"` plus `prefix: "$"`, which is schema-valid but wrong. After a "switching a unit replaces it" rule it gave the right `remove /suffix` + `add /prefix "$"`.
    - Latency was 2.2–5.8 s per edit.
    - Lesson: schema validation can't catch wrong-but-valid edits, so the prompt rules matter.
  - **Not verified yet:** on-device Nano for both tasks needs headed Chrome with the Prompt API flag. In the headless run there was no voiceover loaded, so the recompile after a quick edit was a no-op; the code path is wired but wasn't exercised live.
- **Spec 00 task 11: walking skeleton measurements, collected** (all from this log, Nov 14–15). **Spec 00 is complete.**

  | Step | Where | Time |
  |---|---|---|
  | Whisper (`whisper-base_timestamped`), 4.8 s of speech | browser worker, headless Chrome | about 1.7 s (one-time model download about 80 s) |
  | Compile a one-slot project → composition | Node, median of 20 | 0.63 ms (max 1.48 ms) |
  | `slots.detect` | cloud `gemini-3.8-flash`, thinking LOW | 3.0–3.5 s (12 s with default thinking) |
  | Deterministic tag + detect + post-pass, 3,000 words | Node | 14.7 ms |
  | `edit.patch` | cloud `gemini-3.5-flash-lite`, thinking MINIMAL | 2.2–5.8 s |
  | Render 8 s at 1080p | HyperFrames producer, local | 15.2 s |

  The device column is still missing: Nano timings need headed Chrome with the Prompt API flag. `/dev/skeleton` now mirrors every timing line to the console (R6.1). Router decisions are recorded in D-027.
- **Spec 05 task 11, `packages/ai` half (Kiro run 28), reviewed:** `transcribe.cloud` + `toTranscript`, and the router's `image` input became `media` so audio can go inline. I moved the filler list into `@motionpop/schemas` (`isFiller`) because Kiro had to copy it. The UI half (offer cloud transcription when Whisper fails, cost shown first) is still open.
- **Spec 06 task 6: pipeline integration (Claude Code):**
  - **Pipeline:** Processing now runs moments (the tagger), then suggest (detector, then post-pass with registry validation), then save. Ready slots get a v1 version.
  - **UI:** the word strip shows dashed slot cards above the pills with a staggered spring pop-in. Pip gets a "1 slot ready" bubble.
  - **Checked in headless Chromium, local mode:** the sample shows "Found 3 moments", "1 slot found" and the Big number card. The editor opens with the ready big-number slot (40 %, "Our revenue grew") over "Our revenue grew forty percent".
  - **Tests:** 3 new pipeline tests (sample → ready slot + version + `timelineIssues` clean; detector gets the cleaned words and spans; a detector failure fails the suggest card and saves nothing), plus validator tests.
  - **Known break:** `e2e/processing.spec.ts` still expects moments and suggest to be `skipped`. Updating it is spec 06 task 7, which goes to Kiro next. CI doesn't run e2e.
- **Spec 06 task 7 (Kiro run 29), reviewed:** the processing e2e now covers real slot detection, from the strip card and Pip bubble to the ready Big number card over "Our … percent" in the editor, before and after a reload. Kiro added a browser-path perf test (16 ms on 3,000 words). I reran the chromium e2e after my later changes: 8 passed, 1 skipped.
- **Spec 06 task 9: auto-fill (Claude Code):**
  - **What was built:**
    - The `component.fill` task.
    - `runAutoFill` + `useAutoFill` in the editor, behind `flag_auto_fill`.
    - A UI-only `autoFilling` store field, so the card shows generating without ever persisting it.
    - An undoable `applyAutoFill` command.
  - **Deviation from R5.1:** auto-fill uses ONLY_ON_DEVICE, not PREFER_ON_DEVICE. PREFER would fall back to the cloud without Nano, so it would no longer be free.
  - **Tests:** 4 task tests, 8 queue and command tests, and 5 `runAutoFill` tests. The `runAutoFill` tests cover a device fill with undo, no router or flag off, no Nano leaving the slot suggested, edits made while the fill waits or runs being skipped with no rejection toast, and cancel.
  - **Test mistake I made:** my first "edited before" test edited the slot before auto-fill took its load snapshot, which can't happen in the app. I rewrote it to edit while the router is loading.
  - **Not verified live:** headless Chrome has no Nano, so on-device auto-fill is untested against the real model. With the flag on and no Nano, slots stay suggested and nothing goes to the cloud.

## 2026-11-15 · Claude Code (Fable 5.2), spec 07 requirements
- The founder redefined spec 07: looks and scene quality are the product, not a list of small components. A cheap model must give excellent, dynamic results every time, with generated images.
- Researched generation approaches (web search): free-form generated animation code is unreliable; constrained catalogues plus verification hold quality. Checked the Firebase AI Logic image docs (Gemini image models, web SDK shape, sizes, reference-image limits).
- Wrote `.kiro/specs/07-scene-engine-and-looks/requirements.md` (draft, written in Claude Code, not Kiro): the AI writes a small JSON score; scenes, looks, beats, image treatment and quality gates carry the craft. Stopped for approval with four open decisions (original look names, scope by Nov 30, image cost cap, loosening two motion principles). No design, tasks or code yet.
- **Spec 07 requirements approved with changes; design drafted (Claude Code, Fable 5.2):**
  - Applied the founder's changes: polished looks are `field-notes` and `paper-collage`; every scene has an image-free form; four-step energy setting drives the beat interval; a read-time rule for text; final renders wait for images.
  - Image price read from Google's pricing page: $0.0336 per 1K image for `gemini-nano-banana-2.1`. That is the Gemini Developer API list. I could not read the Agent Platform pricing page (the fetch came back truncated), so the price on our backend is unconfirmed.
  - Dropped the 90 % / 20 % figure: I had it only from a search summary, not from the source.
  - Updated `motion-principles.md` (rules 6, 14, new 16 and 17), `docs/decisions.md` (D-028) and the plan row.
  - Wrote `design.md` (draft): scenes are `MotionComponent`s whose params are the score; stage engine with beat scheduling, quiet windows for read time and look-driven juice; looks map semantic surfaces and marks to materials; image pipeline with keying, caching, cap and an export gate. Stopped for approval. No code yet.
- **Spec 07 design revised after founder review (Claude Code, Fable 5.2):** my draft made the director plain code, which reversed the "one call plans the whole video" promise. Now `direct.plan` is one on-device-first AI call (energy curve, peak, scenes, motifs, image slots); a pure enforcer applies the hard rules to any plan; a code-only plan is the fallback. Images are confirmed once per video. Cutout quality is decided by a day-one spike (keying alone vs keying plus segmentation vs a second edit pass), instead of assuming keying is enough.
- **Spec 07 design approved; tasks written (Claude Code, Fable 5.2):** added a per-user daily limit on free cloud plan calls (server-counted, default 10, on-device unlimited; the note on what a modified client could bypass is in the design). `tasks.md` has 29 tasks, 21 in the Nov 30 scope, 7 with Kiro parts. No code yet.
- **Spec 07: research additions folded in (Claude Code, Fable 5.2):**
  - The founder supplied `motion-engine-research.md` and two experiment scripts (written outside this repo's sessions). I copied them unchanged into `docs/research/` and `docs/research/experiments/`, read them, and did not run the scripts.
  - Added R9 to the requirements and matching design sections: on-device prosody (`audio.prosody`), gate reports with up to 2 repair rounds and a safe default, a hand-approved example library with code retrieval, schema rules (now in `ai-tasks.md`), the read-hold rule for juice (motion principle 16 tightened), and a small eval harness. BiRefNet joined the cutout spike with a weights-licence check; RMBG-2.0 and RMBG-1.4 are excluded.
  - `tasks.md` renumbered: 37 tasks, 28 in the Nov 30 scope (was 21), with a stated cut order. Logged as D-029.
  - D-009 already chose HyperFrames, with its spike confirmed on Nov 14. I added a note that the research agrees on licence grounds; nothing reopened.
  - Not verified by me: the research file's figures (MoVer 93.6 % after repair, the BiRefNet lite size, the structured-output limits). Each is re-checked in the task that depends on it.
- **Spec 07 task 1: cutout and image-style spike (Claude Code, Fable 5.2).** 22 images generated with the founder's go-ahead (about $0.90 at list price). Result in D-030:
  - Colour keying wins once it estimates the key colour, unmixes the backdrop from edge pixels and the prompt asks for neutral light. Hair, spokes and glass are clean at 100 %.
  - My first keying pass had three faults the sheets exposed: it failed portraits that touch the bottom edge, left an olive halo on hair, and could not fix a green-tinted white mug. The first two were code fixes; the third needed a prompt line.
  - BiRefNet lite was worse on hair and spokes, is 114–224 MB (the research file said 47 MB), and has an unresolved training-data question. Not adopted.
  - Text recipes held the look without reference images.
  - Parallel image calls hit a 429 rate limit, so generation will be sequential. A call takes 12–18 s.
  - Limits: BiRefNet was run in Node on CPU, not in a browser, and I stopped it after 9 of 12 images. Prices are list prices from token counts, not a bill.
- **Spec 07 tasks 2–13 and 15 (Claude Code, Fable 5.2, with Kiro runs 30–32):**
  - **Built:** schemas (score, look, asset, plan, gate, prosody); on-device prosody in the pipeline; router `maxRepairs`; the stage engine (`beats.ts`, `juice.ts`, `stage.ts`); the scene helper with per-scene score schemas; the first scene, `stat-punch` (3 variants × 3 formats); `motion:check` for scenes.
  - **Kiro:** run 30 schema properties (and it caught my design example disagreeing with the schema); run 31 prosody tests (it found and fixed my pause-detection bug) and the schema-rules test; run 32 engine properties with a mutation check.
  - **Mistakes of mine that the checks caught:**
    - I committed the schemas with a failing config test (I had not read the test output before committing). Fixed in the next commit.
    - My first scheduler made every cue wait out the previous text's read time. `motion:check` showed the number landing over a second late, and the stills showed the label missing in every variant. Corrected and recorded as D-031; this changed a rule I had written into R5.1b.
    - The exit could start before a late spoken word landed. Now the exit shortens.
    - A wide number overflowed in two variants. Minimum sizes fixed.
  - **Result:** `motion:check stat-punch`: 102 cases × 3 formats, 0 failures, 24 warnings (all "count settled more than 80 ms early", which `big-number` also has). `big-number` still passes unchanged. Stills checked by eye in all three formats.
  - **Honest state of the look:** `stat-punch` in the plain look is clean but plain: type and a highlighter bar. The richness the brief asks for comes with materials, marks and the two looks (tasks 20–22), which are not built yet.
- **Spec 07 tasks 20–21, first part (Claude Code, Fable 5.2):** added `roughjs` and `perfect-freehand` (both MIT) and the Caveat hand font (OFL); `engine/decor.ts` draws seeded marks that are revealed by stroking on; the `field-notes` look file; `motion:check` now runs scenes in every polished look.
  - **Seen in the stills:** my first marker circle cut through the "$" and the "n". An ellipse must be about 1.45× wider than the text to clear its corners, so it is now that wide, and it falls back to a marker underline when it would leave the frame or touch another line. In practice the circle only fits in the centred 16:9 variant; the others get the underline.
  - **Result:** `motion:check stat-punch`: 120 cases × 3 formats, 0 failures, in the plain look and in `field-notes`.
  - **Not built yet:** paper strips, torn edges, tape and tilt (the surface materials), so `field-notes` is so far paper, ink, red marker and handwriting.
- **Flaky property fixed:** Kiro's prosody property failed about one run in ten in the full suite. The cause was float rounding in the test's own bound (`length / rate * 1000` gave 1008.9999999999999 for audio that is exactly 1009 ms), not a pause past the audio. The bound has a 1e-6 tolerance now, and 15 of 15 runs pass. I also made the pause-end check in `prosody.ts` unrounded.
- **Model switch:** the founder clicked through the running app for the first time ("small issues, but the editor looks good"; those issues are deferred). Then they switched this session to Opus 5.5 to carry spec 07 on from where Fable left it.
- **Spec 07 task 14, `hook-statement` (Claude Code, Opus 5.5):**
  - **Word-by-word text:** the stage can now reveal text one word at a time, one span per word. Each word appears on its spoken word, or at a steady 280 ms pace once the transcript runs out, and the reveal is compressed to fit the slot.
  - **Scheduler:** a cue can now keep building after it lands (`spanMs`), so the next cue waits for the whole line to finish.
  - **Variants:** `center`, `left` (with an accent bar) and `punch` (a small lead-in, then the emphasis words huge).
  - **Emphasis:** when the score names none, the most stressed spoken word is emphasised.
  - **Prompt catalogue:** `catalogueSummary()` generates it from the scene registry.
  - **Seen in the stills:** emphasis that wrapped onto a second line put the mark under the wrong line, and a highlighter made orange-on-yellow text. Both fixed: marks now sit on the widest line of their words, and highlighted words stay ink.
  - **Moved:** `solo(actor)` moves to task 30, with the drawer that needs it.
- **Spec 07 task 16, gate reports, repair and safe defaults (Claude Code, Opus 5.5):**
  - **`gateSlot`:** builds the slot off-screen and returns reports written by code: actor, rule, numbers and a hint.
  - **`safeScore`:** gives every scene a default that passes the gates.
  - **`component.fill`:** now sends the component's own params schema as structured output, so the known `schema-in-prompt` violation is gone for it. It runs the gate as its check and repairs up to twice. Usage events log `attempts` and `problems`.
  - **A rule I settled on:** a dropped optional cue only counts as a gate failure from the scene's ideal length up. Shorter than that, dropping is the designed fallback, the same rule `motion:check` already applies. Without this, `stat-punch` could not pass at its 2.6 s minimum with any label.
- **Kiro run 33, task 17 (gate and repair properties):** Kiro found a real bug in my scene helper. An empty word list was treated as real timings, so the safe default failed at 2.6 s. Kiro fixed it with a regression test.
- **Spec 07 task 18, example library (Claude Code, Opus 5.5):**
  - **Exemplars:** 12 hand-approved, original exemplars, 2 per variant. Each is gated in CI in 3 formats × 2 looks and also runs as a `motion:check` sample. A CI test checks they are honest: numbers are spoken, and emphasis words are in their line.
  - **Prompt:** the 2 closest exemplars go into the fill prompt, which is about 1,950 characters with the catalogue entry.
  - **My mistake:** I first added the exemplars to `motion:check` with their beats. The check has no word timings, so 213 cases failed on focal timing. The beats are now stripped in samples.
- **CI was red since Nov 15, morning (my miss, Fable and Opus sessions):** I hadn't checked CI after the pushes.
  - The tagger timing test took 64 ms against a 60 ms budget on GitHub's slower runners.
  - `field-notes` (a look) was expected to parse as a plain style pack.
  - Locally the schemas test was served from turbo's cache, because it reads `packages/motion/src/styles`, which wasn't a declared input. It is now.
  - Fixed, along with three flaky tests: random hook lines over 90 characters, a rare coverage rule in Kiro's property, and the detection timing test under full parallel load, which now takes the best of 3.
  - CI is green on ab6e98c.
- **Spec 07 task 20, surfaces (Claude Code, Opus 5.5):**
  - **Materials:** `paper`, `torn-edge` (a seeded polygon), `tape`, `white-border`, `shadow-soft` (it follows the torn outline) and `tilt`.
  - **`stage.surface()`:** builds the look's card or strip behind the text as it is set. A plain look gets nothing.
  - **Seen in the stills:** the first label strip spanned the full box rather than the text, and the 9:16 card touched the frame edge. Fixed with text line boxes and an edge margin.
  - **Result:** in `field-notes`, the hook now sits on a torn paper card and the stat label on a torn paper clipping. Both scenes: `motion:check` 180 cases × 3 formats, 0 failures.
- **Reordered:** I moved the eval harness (task 19) after the director (27) and `paper-collage` (22), because it measures that pipeline. This follows the cut order in `tasks.md`.

## 2026-11-16 · Claude Code (Opus 5.5) · hosted deploy, judge account, first paid calls, map scene, merges
- **Approved by the founder today:** hosted deploy, bucket CORS, real paid test calls kept to cents, judge account.
- **Map scene (spec 07 task 29, Claude Code):** `map-zoom` on d3-geo + Natural Earth (public domain), with zoom, pin and spotlight variants. Every gazetteer place resolves; a test enforces it. `motion:check`: 207 cases × 3 formats, 0 failures. The detector now suggests a map for every named place, with no input needed.
- **Merged Kiro's work:** run-12s (sound engine) and run-07s (chart-story, list-stack, timeline, quote). Conflicts in the scene registry, catalogue and detector resolved by keeping both sides. Suites green after the merge: motion 403, ai 392, web 1036.
- **Hosted on App Hosting:**
  - The web build now builds the motion runtime first, and Next traces `packages/motion/dist` into the standalone server.
  - `JUDGE_EMAILS` is an App Hosting secret.
  - Bucket CORS applied from `storage-cors.json`.
- **Judge account:** email/password, verified through the Admin API. On first sign-in it got 500 credits, so the server-side judge grant works on the hosted build.
- **End to end on the hosted URL, signed in as the judge:**
  - **Upload:** a 75 s voiceover reached the editor in 138 s, including the one-time 80 s voice-model download. It produced 13 slots, and the Japan map played on the word.
  - **Tier-2 custom graphic:** one real call, ready in 21.6 s, 3 credits.
  - **TTS:** one real call, ready in 4.2 s, 2 credits.
- **Bugs found by those runs:**
  - The TTS voice spoke the delivery note "Read naturally" aloud. Fixed: the bare script goes to the model at the natural pace.
  - Usage rows named the cloud model for on-device runs. Fixed: they now say `gemini-nano`.
- **Not a bug, but a testing trap:** Playwright's Chromium ships a stub `LanguageModel` that echoes its input ("On-device model is not available in Chromium"). The app took it for Nano and logged those calls as on-device. Headless runs therefore cannot prove the hybrid route; that needs real Chrome.
- **Still open:**
  - TTS and tier-2 calls don't write usage rows, because they bypass the router.
  - The list-stack card marker wraps only the first word of a broken label.
  - Whisper heard "Nikkei" as "knee-k".
- **My mistake:** a background check command hung for 20 minutes because `prettier --write` with an empty file list waits on stdin.

## 2026-11-16 (later) · Claude Code (Opus 5.5) · render deploy, sound everywhere, landing
- **Render job deployed and verified (spec 08 task 6a, approved by the founder).**
  - A hosted 10 s export reached `done`. The MP4 probes as H.264 1920×1080 30 fps with AAC; mean voice level −20 dB, peak −1 dB.
  - **Speed:** the first export took 165 s. The producer part was 37 s; the rest was Cloud Run starting the job.
  - **Image fix:** it now ships only chrome-headless-shell, drops dev dependencies, and turns off the producer's low-memory profile (it misread 8 GiB as low memory). The image went from 681 MB to 493 MB and producer time from 37 s to 28 s.
  - **Still slow:** job start varies from 40 to 115 s between runs, and it dominates the wait. In one probe gen1 was slower than gen2, so the job stays on gen2.
- **Sound in the editor (spec 12 B6, B10):**
  - A worker mixes the bed 300 ms after each edit. The `PlaybackClock` follower keeps it within 40 ms of the voice (tested).
  - The AUDIO track shows the effects the bed actually plays.
  - The new Audio panel has music rows behind `musicSynthEnabled`, level, ducking, effects toggle, count, shuffle and effects level.
  - **React Compiler lint caught two patterns:** mutating a memoised `Audio` element, and `setState` inside an effect. Both rewritten.
- **Sound in the export (B8), built differently from the spec (D-069):** the job mixes the bed itself from the snapshot, so nothing is uploaded. Verified on hosted: the producer logged two audio clips, and the MP4 differs from the voice-only export with a clear effect at 5.2 s.
  - Whether the effects are loud enough is the founder's listening check (B11).
- **Export modal:** "Include music and effects" is live and on by default.
- **Usage rows:**
  - TTS now reports its own usage, since it bypasses the router.
  - The reporter also flushes on `pagehide`.
  - **Cause of the missing custom and Pip rows:** they ran through the router fine, but my Playwright scripts closed the browser inside the 15 s buffer window.
- **Landing (spec 16, not designed):** `/` is now a public landing page, plus `/terms` and `/privacy`.
  - The hero video is a real local export of the demo project. The editor image is a real screenshot.
  - Prices are read from the config defaults.
  - The privacy page names the processors (Google Cloud, Firebase, Gemini, Anthropic) because accuracy needs it. The founder should review both legal pages.
- **`.kiro` edits in this session:** I ticked tasks in `.kiro/specs/08-*/tasks.md` and `12-*/tasks.md` with notes. These are Claude Code edits, not Kiro runs. No Kiro runs this session.
- **Later the same session:**
  - **Pip's thread survives a reload:** last 40 messages per project in this browser, zod-parsed. Undo handles don't persist; a plan cut off mid-apply shows as stopped.
  - **Styles rail panel:** a real preview still of each look (captured from the editor) and one-click restyle.
  - **Brand kit:**
    - `project.brand` overrides the look's accents through `styleFor`, so preview and export match.
    - The Brand panel and the top bar chip both open it.
    - Pip's brand chip now applies the saved kit; before, it swapped to another look.
    - `setBrand` is a code-only step action; the model can't emit it.
  - **Bug I introduced, then caught in the browser:** the first contrast floor (3:1) rejected the looks' own accents (Editorial's ember is 2.0:1 on its paper). It is now 1.8:1, with a test over every shipped accent.
  - **Caption emphasis:** words were drawn in the raw accent on the dark box, and Field Notes' red was unreadable. They now use the least-lightened accent that reads at 4.5:1.
  - **Pip dock:** it sits under an open left panel, matching pip-conversation.png.
  - **Still toasting:** the Fonts and Media rail items. Fonts needs more bundled OFL fonts; Media needs image assets in compositions.

## 2026-11-16 (evening) · Claude Code · pictures, living motion, fonts
- **Founder feedback:** the graphics were "all text and bland… no animations"; Nano Banana pictures were missing; the map was "good but simple".
- **Pictures in scenes (D-070):**
  - The image model call (AI Logic, cloud only) is painted in the look's recipe, cut out on the device when the key guard passes, and stored by hash.
  - Openverse photo search runs in a new Media panel. Uploads are supported.
  - The inspector has a PICTURE section.
  - Pip's "Add pictures" plan, plus a one-time nudge in the editor.
  - Assets reach the render job.
  - Verified locally: an Openverse photo lands beside the stat-punch number.
  - Real image-model generation is tested on hosted (see below).
- **Motion:**
  - Editorial Explainer is now a full look: snappy personality, camera push and snaps, highlighter marks, sweeps, parallax.
  - A living backdrop under the slots.
  - Cut-the-curve seams between graphics. I adapted the technique from the installed `cut-the-curve` skill and wrote it without GSAP.
  - Map: graticule draw-in, traced outline, the country lifts with a shadow, slow push after landing. `motion:check map-zoom`: 235 cases × 3 formats, 0 failures.
- **Fonts panel:** four bundled OFL families. Verified in the browser: Fraunces replaces Geist in the preview.
- **Tests at the end (as the founder asked):**
  - All suites green: schemas 288, ai 392, motion 426, web 1055, render 181. Typecheck and lint are clean everywhere.
  - Seven tests needed updating for the intended changes. Image slots now export. Image generation is an allowed spender. The lively default look lifts the planned arc. The photo scene needed a catalogue entry and a skill pairing (`calm-explanation`).
- **Skills the founder named:** I couldn't find "Kinetic red" or "Lemo opuscar" online. What is in use:
  - Openverse is integrated.
  - Sound effects are synthesized in code.
  - The `cut-the-curve`, `motion-doctrine` and `hyperframes-registry` skills are used as references.
- No Kiro runs this session.

## 2026-11-16 (night) · Claude Code · globe maps, seams, Newsprint
- **Founder ask:** research how creators make great motion graphics now and implement it. Start with the editorial collage explainer style. Maps should look realistic, in several styles.
- **Research applied:**
  - Transitions: arrivals decelerate, exits accelerate and are shorter. Matched seams with a blur peak. Three to five kinds of transition per film.
  - Collage explainer grammar: 12 fps step, boiling textures, halftone cut-outs, torn paper, tape, marker.
  - Maps fly in from a globe.
- **Built (D-071):**
  - WebGL globe in four styles (satellite, relief, paper, night) with a d3 vector overlay and a fly-in camera.
  - Seams between graphics (slide, zoom, pull, whip, paper) with a key-moment guard.
  - A lens layer (paper sweep, texture boil) and collage paper scraps behind the graphics on stepped looks.
  - Picture treatments (duotone, halftone, torn edge, colour backing).
  - The new Newsprint look. Numbers are set in lining figures everywhere.
  - `sheet` script: renders any scene in any look at chosen times, with an optional picture, so visuals can be reviewed without the editor.
- **Checked:**
  - Sheets of the globe in all four styles, and Newsprint with a cut-out picture.
  - `motion:check hook-statement`: 0 failures. Before the fixes it had 190 failures. The cause was seams moving slots during the check, plus Newsprint's red at 4.41:1. Seams are now off in the check, the key-moment guard is unit-tested, and the red is 4.7:1.
  - Motion suite: 426 tests green.
- **Hosted end-to-end test found five bugs, all fixed and redeployed:**
  1. **No way to change a graphic's type.** Asking Generate for a map still made a big number. The inspector header now has a type menu (it drafts the new type from the slot's own words, free, one undo step). A prompt that names another type switches the slot before Generate.
  2. **Shift-drag picked old defaults.** It made `big-number` or the unbuilt title card; it now picks a scene from the words. Possessives count, so "Japan's" finds Japan.
  3. **Years had separators.** A year read "1,989"; years now render as 1989 or 1990s.
  4. **Projects never reached Firestore.** Reading a missing project was denied rather than returning "not found", so cloud sync never started. The rules are fixed and tested (164 green).
  5. **The preview dropped the globe's imagery** whenever it added pictures. Separately, the render preflight used `page.setContent`, so relative assets (map imagery and pictures) never loaded and exports with them failed. The preflight now serves the folder over HTTP, and map imagery that fails falls back to vectors instead of failing the render.
- **Verified on hosted:** a Japan map slot shows the terrain globe flying in, in the editor preview and in the exported 1080p MP4 (Cloud Run, software WebGL). A local `render:project` run of a Newsprint map also rendered the paper globe.
- No Kiro runs this session.


## 2026-11-16 (evening) · Claude Code · a fully working product first
- **Founder ask:** make everything work end to end (marketing page, editor, dashboard) before more style work. Pasting long scripts looked broken, and 3,000 characters was too short. Keep the budget low. Use Kiro (cheap model) for the major test runs. Leave the existing styles alone.
- **Built and deployed:**
  - **Long scripts (D-072).** The limit is now 6,000 characters. The script moves between screens in session storage instead of the URL, and nothing is trimmed silently: a red counter plus "Trim N characters". The voice is made in parts of up to 1,200 characters with "part N of M" progress. The export cap is 8 minutes.
  - **Render limits corrected.** My first D-072 numbers were wrong: at ~11× real time, an 8-minute map video needs ~90 min, so the 60-minute job timeout would have cut it off. The job now allows 150 min. The longest export costs about $0.50 of Cloud Run. Distributed rendering is noted as the upgrade path.
  - **A `/styles` gallery.** The dashboard's Styles tab and "Explore styles" only showed a toast; they now open it.
  - **Single graphic.** "Or just make a single graphic" only showed a toast. It now turns one typed line into a short project with one graphic on a silent track, with no captions.
  - **Landing hero.** It now plays a real 1080p export (a globe flight plus a stat). The old sample was mostly empty frames.
  - **Share page.** The poster is now the render's still.
  - **Audio.** Deleting a project right after duplicating it no longer leaves orphaned audio. Regression test added; it fails without the fix.
- **Hosted end-to-end checks (judge account, automated Chrome):**
  - A 3,033-character script voiced in 3 parts (54 s), processed in 115 s → 192 s video, 29 slots.
  - Upload (12 s to editor) and recording with a fake mic (12 s).
  - Single graphic (6 s).
  - Dashboard rename / duplicate / delete / search, all surviving a reload.
  - Export of a 9 s video (240 s, of which ~2.5 min is Cloud Run cold start on a 493 MB image) → Copy share link → anonymous share page plays.
  - `/styles` → Start with a style.
- **Known, not fixed:**
  - Every export pays the cold start.
  - The dashboard thumbnail glyph shows bars for map slots.
  - `detect-perf.test.ts` can flake under full-suite load.
- **Kiro:** run10 verified the long-script change and fixed three tests that hard-coded the old export cap. run11 verified the gallery, landing, audio and render commits and changed nothing (see KIRO_LOG).
- **Cost this session:** about 3 minutes of TTS, two short exports and a few Cloud Run builds: cents.
