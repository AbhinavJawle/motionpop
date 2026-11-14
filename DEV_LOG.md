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
