---
inclusion: always
---

# Handoff: continuing the build in Kiro (written in Claude Code, 2026-11-15)

Claude Code (Fable 5.2, then Opus 5.5) drove planning and most implementation up to commit `7221ee5`. The founder is moving day-to-day work into the Kiro IDE (Opus 5.5) because of Claude Code usage limits. This file carries everything the repo did not already hold, so work continues at the same quality. Read it fully at the start of every session, then the files it points to.

## 0. Session start (every time)

1. Read the last entries of `DEV_LOG.md` and `KIRO_LOG.md`, and `git log --oneline -10`.
2. Open `.kiro/specs/07-scene-engine-and-looks/tasks.md`. The notes after each checked task describe what was actually built; trust them over older design text.
3. Pick the next task from section 3 below (the order there overrides the task numbers).
4. Before touching `packages/motion`, read `component-contract.md`, `motion-principles.md`, `style-pack-format.md`, and spec 07's `design.md` sections for the task.

## 1. Where the project is

- **Specs 00–04 and 06 done; 05 mostly** (leftovers: tasks 10, the UI half of 11, and 12). **Spec 07 (scene engine and looks) in progress.** **Spec 08 (render + export) has no spec yet** and must work by Nov 30.
- **Spec 07 done:** tasks 1–18 except 19, plus 20–21 in part.
  - Schemas and prosody.
  - The stage engine: beats on the voice, read time, juice, camera.
  - Scenes: `stat-punch` and `hook-statement` (word by word on the voice).
  - Gate reports with a 2-round repair loop and per-scene safe defaults (`scenes/gate.ts`).
  - The example library (`scenes/exemplar.ts`, `scenes/*/exemplars.ts`).
  - Hand-drawn marks (`engine/decor.ts`) and surface materials (`engine/materials.ts`, `stage.surface()`).
  - The `field-notes` look (`packages/motion/src/styles/field-notes.json`).
- **Not yet visible in the app:** scenes run in tests and `motion:check` only. They are wired into slot detection and auto-fill in task 27 (catalogue wiring).
- **CI:** green on `ab6e98c`. Check it after every push (section 5).

## 2. Hard-won rules (the quality bar)

These come from mistakes already made. Follow them exactly.

1. **Read test output before committing.** One commit went in with a failing test because the output wasn't read. Run the full definition of done (section 5) and read it.
2. **A scene or look change is not done until the stills look right.** `motion:check` passing is necessary, not sufficient:
   - Build a contact sheet (section 5) and look at it in all three formats, in the plain look and in `field-notes`.
   - Problems the checks could not see and only stills caught: a number landing a second late, labels missing, marks cutting through glyphs, a mark under the wrong line, orange text on a yellow highlighter, a strip spanning the full box instead of the text, a card touching the frame edge.
3. **Voice sync comes first (D-031).** An anchored cue lands on its spoken word. Landed text is never moved or covered during its read time. Only engine-added juice and the camera are restricted then. Don't reintroduce "wait for the previous read time".
4. **Deterministic everything.**
   - Seeded RNG (`core/rng.ts`). roughjs always gets a non-zero seed (`seedOf`).
   - No `Math.random`, no `Date.now`, no CSS transitions or animations in compositions.
   - Every `seek(t)` sets all state (pure function of t).
5. **Scenes stay look-free (R3.3).** A scene asks for semantic things only: a surface kind (`card`, `photo`, `label`, `strip`), a mark role (`emphasis`, `pointer`, `divider`, `badge`), or a behaviour. The look maps them. Plain looks return null or plain fallbacks, and the scene carries on.
6. **AI plans, code enforces.**
   - Every AI output is parsed with zod, then gated (`gateSlot`), then repaired up to 2 times with code-written hints, then falls back to `safeScore`.
   - No schema text in prompts: structured output carries the schema (`TaskDef.jsonSchema`).
   - All runtime AI goes through `packages/ai/src/router.ts`.
7. **When a check fails, decide whether the code or the check is wrong by reading the spec.** Never weaken a test silently. If a rule changes, say so in the test (a "Changed by …" comment), in `tasks.md` and in `DEV_LOG`/`KIRO_LOG`; for engine rules, also add a decision in `docs/decisions.md`.
8. **Local test results can be stale.** Turbo caches tests. Before claiming green after touching files that another package's tests read, run `pnpm -s turbo run test --force`.
9. **Flaky tests get fixed, not rerun until green.** Timing tests take the best of N and allow slower CI runners. Property tests must not depend on rare random coverage.
10. **Honesty in logs.** Write what actually happened, including your own mistakes and anything unverified. Never fabricate or back-date anything.

## 3. Next work, in this order

1. **Spec 07 task 27, app half first:**
   - Catalogue wiring: `slots.detect` and the deterministic detector map to scenes (number → `stat-punch`, sentence openers and claims → `hook-statement`).
   - Auto-fill fills scenes through `componentFillTask(schemaFor, { gate })`. Pass `scene: { brief: catalogueSummary([scene]), indexedWords, examples: pickExemplars(...).map(exemplarText) }`. On failure, use `safeScore`.
   - Scenes are added to the runtime registry the editor preview uses, so the founder sees them in the editor. Today the web app's `schemaFor` only knows `components`; it must also know `scenes`.
   - Then the director: `direct.plan`, `enforce.ts`, `fallback.ts`, the Processing step, the plan-allowance route with rules and a rules test.
   - Kiro does the enforcer properties.
2. **Task 22, `paper-collage` look:**
   - Stepped motion (`personality.stepFps` about 12), torn colour strips (a `strip` without `paper` = accent colour; already supported in `materials.ts`), tape, cut-out emphasis.
   - Same deliverables as `field-notes`: look JSON, fonts (OFL only, bundled, recorded in `docs/third-party.md`), a reference provenance README, and stills reviewed in all formats.
3. **Task 23, `versus`, and task 24, `chart-story`,** each with exemplars, samples and tests, like the existing scenes. `chart-story` gets the data-honesty properties (Kiro).
4. **Tasks 25–26, images:**
   - `image.generate` (cloud only, cost shown first, sequential with backoff).
   - Colour-key cutout from D-030 in a worker.
   - Asset store, `photo-evidence`, one confirm card per video, and the `canRender` gate.
5. **Spec 08, render + export:** write the spec (requirements → design → tasks, approved by the founder at each step) in parallel. It must work by Nov 30.
6. **Task 19, eval harness, then task 28, end-to-end with real recordings.** Task 19 was moved after 22 and 27 on purpose, because it measures that pipeline.
7. **Leftovers:**
   - The rest of task 20: `marker-arrow`, `stamp` and `torn-rule`, when `versus` or `photo-evidence` need them. `grain`, `halftone`, `glow` and `grid` are skipped as plain.
   - Spec 05 leftovers.
   - The small editor UI issues the founder saw on first click-through (not listed yet: ask them).

Cut order if time runs short (from `tasks.md`): `versus` → harness → second look tuning.

## 4. How to build a scene (the pattern that works)

- **`scenes/<id>/index.ts`:**
  - Content zod schema, with a `.describe()` on each field; descriptions are for the AI.
  - Layout per variant and format, using `scenes/layout.ts` (`stack`, `columns`, `column`).
  - `defineScene({...})` with at least 3 variants (the first is the safe default), cues with `about`, a `focalCue`, `durationMs {min, ideal, max}` and a `safe(words)` function.
  - `build()` uses `stage()`: text, number, shape, surface; `st.on(cue, enter(...), mark(...))`; `st.compile()`.
- **`samples.ts`:**
  - A fast-check `arbitrary`.
  - `edgeCases`: `show-*` cases are kept as stills; exemplars are spread in with beats stripped.
- **`exemplars.ts`:** at least 2 per variant, original content, and beats that index the exemplar's words.
- **Register the scene** in `scenes/index.ts` (`scenes` map) and `scenes/exemplars.ts`.
- **Tests:** layout boxes inside the camera-safe area and apart; schema rejects unknown ids; the focal element lands on the key moment; `assertSeekPure` on random content; the scene's own behaviours.
- **`ideal` duration:** the longest allowed content must get its full read time at `ideal` (`motion:check` fails on a dropped cue at ideal).

## 5. Commands and verification

The shell is zsh. Node comes from nvm, so prefix commands with:
```
export PATH="$HOME/.nvm/versions/node/v24.22.3/bin:$PATH"
```

- **Definition of done (all must pass, read the output):**
  ```
  npx prettier --check .
  pnpm typecheck
  pnpm lint            # 0 warnings
  pnpm test            # or: pnpm -s turbo run test --force
  pnpm motion:check <scene-or-component-id>   # stills + JSON in packages/motion/.check/<id>/
  pnpm --filter @motionpop/web build          # for app changes
  cd apps/web && npx playwright test --project=chromium   # for UI flows
  ```
- **Contact sheet** (Python with PIL is available). Images are kept for `show-*` cases and failures:
  ```
  python3 - out.jpg 300 a.png b.png ... <<'EOF'
  import sys; from PIL import Image
  out,h=sys.argv[1],int(sys.argv[2]); ims=[Image.open(f).convert('RGB') for f in sys.argv[3:]]
  ims=[i.resize((int(i.width*h/i.height),h)) for i in ims]; cols=max(1,1800//ims[0].width)
  s=Image.new('RGB',(cols*ims[0].width,((len(ims)+cols-1)//cols)*h),'white')
  for k,i in enumerate(ims): s.paste(i,((k%cols)*ims[0].width,(k//cols)*h))
  s.save(out,quality=78)
  EOF
  ```
  Look at `*-hold-end.png` (everything landed) and `*-key.png` (the key moment), for 16x9, 9x16 and 1x1, in plain and `-field-notes`.
- **CI** (there is no `gh`):
  ```
  R=$(git remote get-url origin | sed -E 's#.*github.com[:/]##; s#\.git$##')
  curl -s "https://api.github.com/repos/${R}/actions/runs?per_page=4"
  ```
  For failure details, find the check-run id with `.../commits/<sha>/check-runs`, then read `.../check-runs/<id>/annotations`.
- **Firebase CLI:** only `npx -y firebase-tools@latest …`. The project is `motionpop-48409`.
- **Kiro CLI headless runs** (added in the Kiro IDE, 2026-11-15):
  ```
  kiro-cli chat --v3 --no-interactive --agent motionpop-builder "$(cat prompt.md)" > run.log 2>&1
  ```
  - The agents in `.kiro/agents/` are in the universal format (V2 fields plus V3 `permissions`), so both engines load them. A headless run with no engine named uses V2; name it anyway (`--v3`), as the Kiro docs advise for scripts.
  - The universal files are generated: edit the V2 fields (`tools`, `allowedTools`, `toolsSettings`, `hooks`), then run `kiro-cli agent upgrade .kiro/agents` and `kiro-cli agent validate --path <file>`. Hand edits to the generated `permissions` mark the file out of sync.
  - Headless, every "ask" is a deny. On V3 the most restrictive matching rule wins, so a catch-all rule must `exclude` the allowed commands. The upgrader writes it that way.
  - Kiro CLI 3.3.0 (auto-updated after run 33) failed with "Mode 'motionpop-builder' not found" because the files were V3-only and a headless run defaults to V2.
- **zsh gotcha:** always brace variables followed by `:`, e.g. `${M}:generateContent`. A bare `$M:g…` is a zsh modifier and silently corrupts URLs.
- **Python HTTPS:** use `ssl.create_default_context(cafile='/etc/ssl/cert.pem')`.
- **Gemini image calls:** must be sequential (parallel calls return 429). Each call takes 12–18 s and costs about $0.04.

## 6. Commits, logs, honesty

- **Commits:** conventional, small, referencing the task: `feat(07-scene-engine-and-looks): task 22 paper-collage look`. Commit after each task, push at least daily, and check CI after pushing.
- **Logging work done in the Kiro IDE:**
  - Log it in `KIRO_LOG.md` as a Kiro session: date, agent/IDE, model, tasks, what was built, what failed, the checks run.
  - Commit trailer: `Co-Authored-By: Kiro Agent <244629292+kiro-agent@users.noreply.github.com>`.
    That is the GitHub `kiro-agent` account (the identity Kiro's own GitHub commits use), so the avatar links. The older `Kiro <noreply@kiro.dev>` trailer matched no account and showed blank.
  - This is genuine Kiro usage and counts for Kiroween (Frankenstein category; the write-up covers specs, steering, hooks, MCP, property tests, agents, skills: what worked and what didn't).
- **Never edit or back-date earlier log entries,** except to add a clearly labelled note.
- **When the founder comes back to Claude Code,** its sessions keep going to `DEV_LOG.md`.
- **Mark the task done** in `tasks.md`, with a short italic note of what was really built and any deviation.

## 7. Founder preferences and constraints (from Claude Code's memory)

- **Solo student founder.** No teammate, so the agent drives everything. They want the agent to take decisions and keep going, and to ask only about real product or scope decisions or anything that costs money.
- **Chat style:** they asked for terse chat replies earlier ("caveman" style). Code, docs, commits and logs are always written in full, clear sentences.
- **Tokens:** be efficient. Don't re-read whole large files when a section will do.
- **Quality bar for motion:** they want premium, dynamic, non-linear motion graphics for Gen-Z attention spans. The reference genres are documentary explainers, essay channels, science explainers and product launches. Never use creator or brand names anywhere (style names, copy, code, demo content).
- **Design source of truth:** `design/screens/*.png` and `design/figma-export.css`. When docs disagree, the designs win. The UI should feel poppy, animated and alive, with Pip (the original ghost mascot, built in code) reacting.
- **Cost:** keep Firebase and GCP spend as close to $0 as possible: free tiers, emulators, min instances 0. Say before running anything that costs money; image generation needs the founder's go-ahead.
- **Never:**
  - commit secrets;
  - add GSAP (licence; HyperFrames is driven through `hf-seek`);
  - run `npx hyperframes events` (telemetry);
  - gitignore `.kiro/`;
  - deploy to production without approval;
  - move or restructure `Information/` (reference only, read-only).
- **Claude is allowed** as a model everywhere (tier-2 custom graphics), behind the provider flag.
- **Secrets in the shell:** never print, copy or log environment variables or shell profile contents.
- **Kiro agent permissions:** the headless `motionpop-builder` agent can only write `apps/`, `packages/`, `services/`, `skills/` and `.kiro/specs/`. Logs, docs and steering are written from the IDE chat.

## 8. Key decisions to know (details in `docs/decisions.md`)

- **D-009:** HyperFrames, with our own deterministic runtime through `hf-seek`.
- **D-025, D-026:** AI Logic uses `AgentPlatformBackend('global')`; TTS is `gemini-3.8-flash-tts`.
- **D-027:** the router.
- **D-028:** the scene engine (the AI writes a small score; scenes are `MotionComponent`s whose params are the score).
- **D-029:** research adopted (prosody, gates and repair, exemplars, schema rules, read-hold, eval harness).
- **D-030:** cutouts use colour keying with backdrop unmixing and a neutral-light prompt line. No segmentation model.
- **D-031:** cues land on their spoken word; read time protects landed text, not the timing of the next cue.
- **Gate policy (task 16):** a dropped optional cue is a gate failure only from the scene's ideal length up. `budget` and `overlap` are reported but not sent to the model for repair.
- **Firebase AI Logic facts:**
  - `InferenceMode` values are lowercase in the SDK (map with `InferenceMode[mode]`), and `response.inferenceSource` gives `on_device` or `in_cloud`.
  - On-device ignores `systemInstruction`: use `onDeviceParams.createOptions.initialPrompts`.
  - Structured output: cloud uses `responseJsonSchema`; on-device uses `promptOptions.responseConstraint`.

## 9. Kiro features: use them for real (judges score the process)
Judges score how deeply Kiro is used (specs, steering, hooks, MCP, newer features), engineering quality (tests, CI gates on every step, clear docs) and one complete solution without feature bloat. Use each feature where it does real work, and log it in KIRO_LOG:
- **Specs:** every new feature starts as a Kiro spec (EARS requirements → design → tasks). Kiro writes specs 08 onwards; Claude Code reviews them.
- **Custom agents:** `motionpop-builder` implements; `motion-qa` reviews the stills of every scene change (contact sheets in 3 formats × the looks) and its findings go back to the builder; a read-only `spec-reviewer` checks each new spec against steering before implementation.
- **Hooks:** agent hooks (spawn context, typecheck of touched packages after writes, the stop-hook log) and IDE hooks in `.kiro/hooks/` for real triggers (a scene file saved → its `motion:check`; a `tasks.md` box checked → the definition-of-done reminder).
- **MCP:** Context7 before coding against fast-moving APIs (HyperFrames producer, Firebase AI Logic); Chrome DevTools MCP to screenshot UI screens at 1440×900 and compare them with `design/screens/*.png`; Firebase MCP for emulator and rules work (never deploys).
- **Powers and skills:** install a Firebase power when one exists; the HyperFrames and Firebase skills in `.kiro/skills/` are read before the matching work.
- **Property-based tests:** every spec has properties written by Kiro.
- **CI:** every gate the definition of done uses runs in CI (format, typecheck, lint, tests, build, rules tests, gitleaks, `motion:check` for every scene).
