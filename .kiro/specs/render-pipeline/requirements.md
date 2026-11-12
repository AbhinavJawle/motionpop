# Requirements: render-pipeline

Spec #1. Proves the riskiest part of the product first: one handcrafted scene component that previews live in the browser and exports to MP4, locally and on Remotion Lambda. Everything later (style system, skills, planning engine, editor) plugs into the contracts defined here.

## Introduction
A **scene spec** is the JSON document that fully describes one clip: component id, format, duration, style pack, props and direction. It is what the AI will eventually produce. This spec defines that document, renders it with the **Number Reveal** component, previews it with Remotion Player and exports it to MP4.

Out of scope here: the other seven components, more than one style pack, brand kits, director-skill parsing, AI, auth, persistence and the real editor UI. The `/playground` page is a developer page, replaced later by the `scene-editor` spec.

## Glossary
- **Scene spec:** validated JSON for one clip (`SceneSpec`).
- **Direction:** the part of a scene spec that controls staging: phase timings and camera keyframes. Director skills (spec #4) will produce it.
- **Phase:** a named time span inside a scene, as fractions of its duration (e.g. `count: 0.08–0.45`). Each component declares the phases it understands.
- **Render target:** where an export runs: `local` (Node renderer on the developer machine) or `lambda` (Remotion Lambda on AWS).

---

## Requirement 1: Scene spec contract
**User story:** As the planning engine (later) and as the developer (now), I want one validated JSON shape per clip, so that preview, export and AI output all agree.

1.1 THE SYSTEM SHALL define `SceneSpec` as a zod schema in `@motionpop/schemas` containing: `version` (literal 1), `component` (registered component id), `format` (format id), `durationSeconds`, `stylePack` (style pack id), `props` (component-specific) and `direction` (phases + camera keyframes).
1.2 WHEN a scene spec is parsed THE SYSTEM SHALL validate `props` against the schema of the component named in `component`, and SHALL reject the spec with a path-specific error message if they don't match.
1.3 WHEN a scene spec's `direction` contains phases THE SYSTEM SHALL reject it unless every phase has `0 ≤ start ≤ end ≤ 1`.
1.4 WHEN a scene spec's `direction` contains camera keyframes THE SYSTEM SHALL reject it unless keyframe times are within 0–1 and strictly increasing, and every scale is within 0.8–1.25.
1.5 THE SYSTEM SHALL derive the video config (`width`, `height`, `fps`, `durationInFrames`) from a scene spec with one pure function, used by both the Player and every render target.
1.6 WHEN `durationSeconds × fps` is not a whole number THE SYSTEM SHALL round `durationInFrames` to the nearest frame, and the result SHALL be at least 1.

## Requirement 2: Number Reveal component
**User story:** As an explainer creator, I want one big number to land with weight, so that viewers remember it.

2.1 THE SYSTEM SHALL provide a Number Reveal component whose props are: `value` (finite number), `locale`, `format` (`decimal | currency | percent`, optional `currency` code, `notation: standard | compact`, `maximumFractionDigits` 0–3), optional `label` (above the number, ≤ 60 chars) and optional `context` (below, ≤ 90 chars).
2.2 THE SYSTEM SHALL count the displayed number from 0 to `value` during the `count` phase, decelerating towards the end, and SHALL display exactly `Intl.NumberFormat(locale, format).format(value)` from the end of the `count` phase until the last frame.
2.3 WHILE the `count` phase is running THE SYSTEM SHALL change the displayed value monotonically (never moving away from `value`).
2.4 THE SYSTEM SHALL use the accent colour only for the number, and muted/text roles for the label and context line (one hero element).
2.5 THE SYSTEM SHALL keep the label, number and context line inside the format's safe area in all four format presets, by fitting the number's font size to the available width (never cropping or overflowing).
2.6 WHEN the context line is present THE SYSTEM SHALL keep it fully visible for at least `0.3 s × words + 1 s`, and SHALL reject a scene spec whose duration or phases make that impossible, with an error that states the required minimum.
2.7 THE SYSTEM SHALL apply the camera keyframes from `direction` as a smooth (ease-in-out, no overshoot) scale of the whole scene.
2.8 WHEN `direction` omits phases or camera keyframes THE SYSTEM SHALL use the component's default staging (anticipation → count → hold with context line).
2.9 THE SYSTEM SHALL render deterministically: the same scene spec and frame number SHALL always produce the same output.
2.10 THE SYSTEM SHALL ship a catalog entry for Number Reveal (id, name, description, example prompt, example props, compatible skills) whose example props parse with the component schema.

## Requirement 3: Style tokens (minimal)
**User story:** As the developer, I want the first component to use real style tokens, so that the style-system spec only adds packs instead of rewriting components.

3.1 THE SYSTEM SHALL define a `StylePack` schema with palette roles (`background`, `surface`, `text`, `primary`, `accent`, `positive`, `negative`, `muted`), typography (`display`, `body`, `numerals` families), easing (`enter`, `exit`, `emphasis` cubic-bezier tuples), durations and background treatment.
3.2 THE SYSTEM SHALL ship one style pack, `money-documentary`, whose easing values all lie within 0–1 (no overshoot).
3.3 THE SYSTEM SHALL contain no colour values, font names or bezier arrays in component code; components SHALL read them from the style pack.
3.4 THE SYSTEM SHALL load every font a style pack uses through Remotion font loading, so that preview and renders never fall back to system fonts, and every font SHALL have an open licence recorded in `LICENSES-ASSETS.md`.

## Requirement 4: Live preview
**User story:** As a user, I want to see the scene instantly in the browser, so that I can judge it without waiting for a render.

4.1 THE SYSTEM SHALL provide a developer page `/playground` that previews a scene spec with Remotion Player, with play/pause, scrubbing and looping.
4.2 WHEN the user switches the format on `/playground` THE SYSTEM SHALL re-lay out the same scene for the new format without reloading the page.
4.3 WHERE the safe-zone overlay is turned on THE SYSTEM SHALL draw the format's safe area over the preview, and the overlay SHALL never appear in exports.
4.4 WHEN the scene spec on `/playground` is edited as JSON and is invalid THE SYSTEM SHALL keep showing the last valid preview and SHALL list the validation errors.
4.5 THE SYSTEM SHALL show the first preview frame within 1 second of the page becoming interactive on a mid-range laptop.

## Requirement 5: Export to MP4
**User story:** As an editor, I want an MP4 of the exact scene I previewed, so that I can drop it into my timeline.

5.1 WHEN an export is requested THE SYSTEM SHALL render the scene spec to an H.264 MP4 at the format's resolution and 30 fps, with the same frames the Player shows.
5.2 THE SYSTEM SHALL support two render targets behind one interface: `local` (Node renderer) and `lambda` (Remotion Lambda), selected by server configuration.
5.3 THE SYSTEM SHALL let the developer export from the command line (`pnpm render:local <scene.json> [out.mp4]`) without starting the web app.
5.4 WHEN an export is started from `/playground` THE SYSTEM SHALL validate the scene spec on the server, return a job id, report progress (0–100%) when polled, and provide a download link when finished.
5.5 IF a render fails THEN THE SYSTEM SHALL report a failed status with a readable error message and SHALL NOT leave the job stuck in progress.
5.6 THE SYSTEM SHALL name exported files `<component-id>_<format-id>_<short-hash>.mp4`, where the hash is derived from the scene spec, so that identical specs produce identical names.
5.7 WHEN the `lambda` target renders a 10-second 1080p scene THE SYSTEM SHALL finish in under 60 seconds (p50 over 5 runs, warm function).

## Requirement 6: Remotion Lambda on AWS
**User story:** As the developer, I want cloud rendering that scales, so that exports don't depend on my laptop.

6.1 THE SYSTEM SHALL deploy the Remotion Lambda function and site bundle to `eu-central-1` with scripts (`pnpm lambda:deploy`), not by hand-editing AWS resources.
6.2 THE SYSTEM SHALL store renders privately in S3 and SHALL return time-limited signed download URLs.
6.3 THE SYSTEM SHALL read AWS credentials only from environment variables and SHALL document their names with placeholder values in `.env.example`.
6.4 WHILE the authentication spec is not implemented THE SYSTEM SHALL reject export requests in production builds, so that a deployed URL cannot trigger paid renders.
6.5 THE SYSTEM SHALL NOT deploy any paid AWS resource before an AWS Budgets alert exists for the account (manual prerequisite, recorded in the tasks).

## Requirement 7: Developer workflow
7.1 THE SYSTEM SHALL provide a Remotion Studio entry point in `@motionpop/components` that registers one composition per format preset for each component, using the catalog's example props.
7.2 THE SYSTEM SHALL provide fast-check property tests for: video-config derivation (1.5, 1.6), direction validation (1.3, 1.4), final displayed number (2.2), count monotonicity (2.3), safe-area fit for random label/number/context lengths in every format (2.5) and context read time (2.6).
7.3 WHEN `pnpm typecheck`, `pnpm lint` and `pnpm test` run THE SYSTEM SHALL pass with zero errors.
