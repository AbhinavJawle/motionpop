---
id: zoom-from-world-to-place
name: Zoom From World to Place
version: 1
use_when: the narration mentions a country, city, region, route or where something happened
works_with: [map-zoom]
energy: medium
default_duration: 5
---
## Intent
Ground the story in a real place with one smooth, cinematic move.

## Shot sequence (percent of duration)
- 0–15%: world (or continent) view fades in, calm
- 15–60%: smooth camera move to the target (in-out ease), settling exactly on the spoken place name
- 60–75%: country fill fades to accent, pin drops with a small ripple
- 75–100%: label with leader line; optional route arc draws; hold

## Camera
One continuous move. No overshoot. Slight parallax between land and labels.

## Emphasis
Target region in accent; everything else muted land/water colours.

## Sound cues
Soft whoosh during the move, pop on pin.

## Rules
- Labels appear only after the camera settles. Never cover the pin.
- Places must exist in the gazetteer.

## Anti-patterns
- Spinning globe for no reason, multiple zooms in one slot, satellite imagery.

## Voice sync
keyMoment = start of the spoken place name.
