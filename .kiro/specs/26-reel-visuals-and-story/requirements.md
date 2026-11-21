# Spec 26: Reel visuals, story and sound (3/10 → pro reels)

> Written in a Claude Code session (2026-11-21). Founder ask: "do anything in power to maximise graphics and the quality of these reels. The biggest things are great animations and storytelling in those animations, then external b-roll and references: if someone says Notion, the Notion logo should be used in the animation. I need fully usable, professional, engaging edits."

## Why
Spec 25 reels are text-and-icon cards only. Both reference reels are mostly *real visuals*: logos, product screenshots, illustrations, charts and kinetic type over imagery, with a sound hit on every reveal and graphics that keep building across cuts. The cloud director also returned half-empty scenes (its flat schema let it skip required fields), so most scenes fell back to the speaker.

## Requirements (EARS)
- **R1.1** THE director SHALL first write a story (topic, arc, visual motif) and then scenes tagged with a story beat (hook, setup, tension, turn, proof, payoff, cta).
- **R1.2** THE director's output schema SHALL be one object per template with that template's fields required, so a valid answer can never be an empty scene.
- **R1.3** WHEN the speaker names a brand, product, tool, app or website THE director SHALL show it (a logo hero, a logo row, logos inside list/stack/compare items, or the site's page) on the word it is spoken.
- **R1.4** WHEN a scene talks about something concrete or a metaphor THE director MAY request a picture (`photo` from stock, `illustration` generated in the look's style) with a short subject.
- **R1.5** A graphic MAY continue across a cut to the speaker (`carry`): items already revealed stay on screen without replaying their entrance.
- **R2.1** THE engine SHALL provide media templates: `logo` (one brand hero), `logos` (2–6 brands building on their words), `image` (a framed or full-bleed picture with slow camera move, title and kinetic words) and `website` (a real page screenshot in a browser frame, scrolling, optional strike).
- **R2.2** List, stack and compare items SHALL accept a logo in place of an icon.
- **R2.3** Every media template SHALL render a designed fallback (wordmark tile, icon, mock page) when its picture is missing, so a reel never shows a broken image.
- **R2.4** Pictures SHALL be project assets (`project.assets`, owner-only Storage), loaded before the first frame, and copied into the export composition (no network at render).
- **R3.1** Logos SHALL be fetched at runtime from what the speaker said (never bundled in the repo), through our server route, and stored as project assets.
- **R3.2** Illustrations SHALL go through `packages/ai` (Firebase AI Logic image model) and cost credits shown before the action; stock photos SHALL carry attribution.
- **R3.3** Website screenshots SHALL be taken by a server we run (no third-party screenshot API), sized for the browser frame.
- **R4.1** THE export SHALL carry a sound-design track: a whoosh on each graphic entrance, ticks on list reveals, pops on logos, a rise into counters and an impact on punchlines, mixed under the voice with the deterministic SFX synth, plus an optional music bed.
- **R4.2** The editor preview SHALL play the same sound track.
- **R5.1** The cloud reel director and each paid media call SHALL charge credits with the cost shown first, and refund on failure.
- **R5.2** THE system SHALL not write third-party brand names into repo code, copy or demo content; brand data exists only at runtime from the user's own words.
