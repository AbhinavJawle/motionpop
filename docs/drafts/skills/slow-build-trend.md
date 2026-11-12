---
name: Slow-Build Trend
id: slow-build-trend
version: 1.0
use_when: Showing a trend over time where tension should rise gradually to a peak or final point.
works_with: [line-chart, bar-chart, timeline]
energy: medium
default_duration: 8s
---

## Intent
Build tension gradually. The journey matters as much as the destination. Each data point is a step in the story.

## Shot sequence (timing as % of duration)
1. **0–10%**: Title and axes appear. Establish context.
2. **10–70%**: Sequential reveal of data points, steady pace. Each point gets a subtle sound tick.
3. **70–85%**: Final point emphasized — camera pushes in slightly, accent color, impact sound.
4. **85–100%**: Hold on the complete chart with final annotation visible.

## Camera
- Starts at scale 1.0
- Slow drift rightward or upward following the trend (parallax with data)
- Push-in on final point (scale 1.0 → 1.05 over 70–85%)

## Emphasis
- First points in muted colors
- Progressive brightening as trend builds
- Final point in accent color with optional glow
- Annotation appears only after final point lands

## Sound cues
- Subtle tick on each data point reveal (10–70%)
- Slightly louder tick or soft impact on final point (70%)
- Optional: quiet rising tension bed underneath

## Rules
- Never reveal all points at once — sequential is essential
- Each point should have equal time except the last
- The final point gets extra emphasis (color + scale + sound + hold)
- Camera movement must be smooth and continuous, never jumpy

## Anti-patterns
- ❌ All-at-once reveal (loses the build)
- ❌ Irregular timing between points (breaks rhythm)
- ❌ No emphasis on the final point (anticlimactic)
- ❌ Fast, snappy motion (undermines the "slow build" feeling)

## Voice sync (if voiceover present)
- If voice lists years or points, sync each data point to the spoken word
- Final point syncs to the most emphasized word
