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

