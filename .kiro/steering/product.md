---
inclusion: always
---

# Product: Motionpop

## One-liner
Bring your voice. We'll bring the motion. Premium motion graphics that follow every word you say.

## Who it's for
1. **Explainer creators** (finance, tech, history, education): charts, numbers, maps and titles synced to narration, without a motion-design tool.
2. **Video editors** who want consistent graphics and transparent overlays fast.
3. **Founders and marketers** making product and data videos.

The founder is user #1 (runs an animated finance/AI explainer channel).

## The problem
Motion graphics are slow, expensive or generic. AI video tools generate whole videos slowly (minutes), hide their style logic, and give little precise control.

## Core experience (the demo path)
1. **Start:** record in the browser, upload a voiceover, or paste a script (we generate the voice with Gemini TTS).
2. **Processing:** clean the audio (fillers, long pauses), transcribe with word timings, find moments, suggest slots.
3. **Editor:** transcript timeline (slots, words, waveform, audio). Each slot sits above the words it belongs to, with a reason ("You said 'revenue grew forty percent since 2020'").
4. **Auto-fill:** suggested slots fill on-device in the background, so graphics are already forming when you open the editor.
5. **Generate:** click a slot → pre-filled prompt → Generate (cloud, 3 credits). Library components render in seconds.
6. **Refine:** quick edit (on-device, free), frame notes (draw on the frame), inspector (content, data, style, timing), versions.
7. **Pip panel:** whole-video requests ("use brand colours everywhere") come back as plans with Apply all / Undo.
8. **Formats and export:** 16:9 / 9:16 / 1:1 re-layout, captions toggle, export MP4 (or transparent WebM).

## What makes us different
- Graphics follow your voice (transcript-first timeline), not chat-first.
- A library of hand-crafted components + style packs + **visible, editable director skills** ("Save as my style").
- Hybrid AI: on-device instant edits, cloud for heavy generation; cost shown before every credited action.
- Speed: first preview in seconds.
- Original style names, never named after real creators or brands.

## Brand
- Name: Motionpop (lowercase wordmark "motionpop").
- Mascot: **Pip**, a soft original ghost. Friendly, playful, never scary. See `pip-mascot.md`.
- Voice: warm, short, confident, a little playful. "Ready in 4.2s", "Pip is thinking…", "Drop it, I'll catch it!"
- Feel: the UI is poppy, fun and alive. Springy micro-interactions, Pip reacting to everything, playful empty states. Calm surfaces, lively details.

## Success for the hackathons
- Works end to end in a 3-minute demo on a hosted URL.
- Hybrid inference visibly essential (Firebase).
- Deep, genuine Kiro usage, documented honestly (Kiroween).
- Looks and feels premium.

## User journeys
1. **First-time creator:** sign in → empty dashboard → drops a voice memo → processing → editor with suggested slots already filling → generates one in the cloud → quick edit → 9:16 → export → share link.
2. **Returning creator:** dashboard → Continue card → Resume → shift-drag words to add a slot → asks Pip "use brand colours everywhere" → Apply all → export 1080p.
3. **Script-first:** paste a script → choose a voice → generate voice → processing → editor.
4. **Editor-pro:** exports transparent WebM overlays for their own editing software.

## Credits
Free plan: **20 credits** on sign-up. Judge/test accounts get a larger allowance (Remote Config, default 500). On-device actions are always free. Costs live in `ai-tasks.md`.

## Non-goals (hackathon build)
Character animation, 3D sets, cutting footage, team collaboration, mobile editor, real payments, marketplace.

## Glossary
| Term | Meaning |
|---|---|
| Slot | A time range on the timeline (aligned to words) where one graphic plays |
| Component | A hand-crafted, parameterised motion graphic type (bar-chart, map-zoom…) |
| Params | The JSON data a component renders (validated by its zod schema) |
| Style pack | Visual tokens (colours, fonts, textures, motion timings) applied to components |
| Director skill | Markdown file describing how to direct a type of scene (intent, shot list, rules) |
| Version | A saved state of a slot's params |
| Tier 1 / tier 2 | Library generation (fill params) / custom generation (AI writes a composition) |
| Quick edit | Natural-language tweak turned into a JSON patch (on-device first) |
| Frame note | A drawing + comment pinned to a moment in the preview |
| Pip | The mascot and the whole-video AI assistant |
| EDL | Edit decision list of audio cut ranges (fillers, pauses) |
| Key moment | The time inside a slot where the focal element lands (on the spoken word) |
