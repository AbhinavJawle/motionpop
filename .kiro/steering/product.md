---
inclusion: always
---

# Product: Motionpop (working name)

A web app where a user describes **one scene** in plain words and gets a **cinematically directed, on-brand motion-graphics clip**, refines it without re-rolling, saves it to a library, and exports it for their video editor.

Tagline: *AI can animate. It can't direct. We do.*

## USP
**Director skills**: markdown files that stage a scene like a motion director would (shot sequence, timing, camera, emphasis, holds, sound cues). Supporting pillars: handcrafted components, style packs, brand kit, personal library with references, edit-don't-re-roll, editor-ready formats.

## Users (MVP focus)
1. Explainer YouTubers (first user: Abhinav, channel "The AI Impact").
2. Video editors who need clips for Premiere/DaVinci.
3. Small business owners with no design skills.

## Principles (constraints, not suggestions)
- **Scene-first.** One clip is the unit of work. No script → full video pipeline.
- **Golden rule:** runtime AI outputs **validated JSON only**. It never writes animation code.
- **Taste over quantity.** Fewer, better components. Every default must look premium.
- **Edit, don't re-roll.** Refinement is a targeted JSON patch; nothing unrelated changes.
- **Time to wow < 60s** for a new user.
- **Transparent.** Users can see which skill directed a scene and why.
- **Numbers are verified in code**, never by AI.
- **No brand names** in presets (descriptive names only), no copied logos/fonts/characters.

## MVP scope (deadline: internal Dec 3, hard Dec 4 2026 14:00 PT)
Render pipeline (preview + MP4 1080p30) · 6–8 components · 3 style packs · 8 skills · planning engine · plan chips · chat refine + quick controls + version history · basic brand kit · 4 formats with auto-reframe · basic library · deterministic checks · Cognito auth + BYOK · landing page.

Anything else is out of scope unless Abhinav agrees and `docs/KIRO_CONTEXT.md` is updated.

## Sources of truth
- Process and scope: `docs/KIRO_CONTEXT.md`. Product detail: `docs/product-spec.md`. Use `#full-spec` to load both.
- Solo developer: Abhinav. Ask him when product intent is unclear; offer 2–3 options with a recommendation.
