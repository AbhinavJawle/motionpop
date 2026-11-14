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
