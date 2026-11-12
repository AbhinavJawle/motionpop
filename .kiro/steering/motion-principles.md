---
inclusion: fileMatch
fileMatchPattern: ["packages/components/**", "packages/skills/**", "packages/styles/**"]
---

# Motion principles (the "premium" bar)

Every scene must pass these. If a change makes a scene feel more like a template, it's wrong.

## Hierarchy
- **One hero element per moment.** Everything else is muted (palette role `muted`) or still.
- Motion guides the eye to the message. Nothing moves without a reason.
- Never run two competing motions at once (e.g. a count-up while a title slides in).

## Timing
- **Read time:** a text element stays fully visible for at least `0.3s × words + 1s`.
- Holds are part of the design. A hold means nothing moves except, at most, a slow camera drift.
- All timing in components is computed from **frames** (`useCurrentFrame`, `fps`), never wall-clock time or `Date`/`Math.random`.
- Skills express timing as **fractions of duration**; components convert to frames. Scenes must survive any duration in their allowed range.

## Easing
- **No linear motion** for anything visible, except constant camera drift and number count-ups that then decelerate.
- **No overshoot or bounce** unless the active skill explicitly asks for it. Style packs' `emphasis` curves must not overshoot (all bezier y values within 0–1).
- Entrances decelerate (ease-out); exits accelerate (ease-in); camera moves use ease-in-out.

## Colour
- `accent` = emphasis. Use it on **one** element per moment. Never as decoration.
- `positive`/`negative` only for meaning (gain/loss), never for variety.

## Camera
- Defaults are subtle: scale changes of 1.00–1.10, no rotation, no shake except where a skill specifies it (max 2 frames).

## Formats
- Re-layout per format, never crop. Text sizes come from the format's type scale.
- Keep all text and key elements inside the format's safe zone.
- Minimum text height at 1080p output: body 32px, labels 28px (scaled proportionally for other sizes).
