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
