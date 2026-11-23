# Spec 36 design: depth and colour

## Idea
The hero stays exactly as approved. What changes is the paper it sits on. The paper is lit, and it moves a little:
- A faint storyboard grid.
- Three soft lights (Pip blue at the top right, ember at the left, violet at the bottom right), drifting on 23–31 s loops.
- Your voice as a wide waveform in the brand colours, breathing behind the top edge of the editor. The editor rises out of the sound it was made from, and about a quarter of it shows above the fold.

The rest of the page takes its colour from the section markers. It ends on the same waveform, with Pip's plane crossing a sunset.

A first pass used a night sky with a halftone horizon. The founder rejected it as too close to the reference and as a change to the hero layout, so it was removed.

## Pieces
- `components/landing/hero-backdrop.tsx`:
  - `HeroLight`: the grid and the drifting lights.
  - `Voice`: 260 seeded bars in a phrase/word/syllable envelope, coloured along Pip blue → violet → ember → sun → Pip blue. Each bar scales on its own 1.9–3.3 s loop, using transform only.
- `hero.module.css`: the lights, the bars and the ink editor frame (10 px hard shadow). Reduced motion stops the lights and the bars.

## Markers instead of spots
`Cue`: a timeline clip in the section's colour, with an icon, a tiny waveform and the section's timecode. Read top to bottom, the page is a timeline. The nav gets an ember playhead that follows the scroll (`animation-timeline: scroll()`; hidden without support).

## Sections (full-width bands, each `py-24 sm:py-28`)
| Band | Background |
|---|---|
| Ticker | Pip blue |
| How | storyboard grid. The clapper Pip claps the take in over the panels; the action is centred below |
| Looks | pale ember wash with ember dots. The four looks sit on one tilted strip of film |
| Hybrid | mint dots on the device side, violet on the cloud side |
| Plans | pale violet, with columns centred |
| Features | pale sun with a fading grid. The juggling Pip juggles the fiddly bits beside the title |
| Audiences | white with an ember dot corner |
| Stitched | black, with a stitched seam on both edges |
| Pricing | white with a sun dot corner |
| FAQ | pale Pip |
| Closer | Pip → violet → ember dusk. The plane crosses a striped sunset; the waveform sits along the bottom edge |

## Pip on the button
- A Look rig between Perk and Float plays a 9 s loop:
  1. Look left (body slides and tilts 7°, eyes slide further).
  2. Look right.
  3. Watch its paws drum the edge four times.
  4. Float.
- Hover or focus turns Pip to face you; leaving restarts the loop. The float and the blink never restart.

## App screens
`PaperPage` gets a `desk` background:
- A faint 22 px dot grid.
- A Pip-blue light at the top right, an ember glow at the bottom left and a violet hint on the left.
Frames keep their white fill, so they lift off the desk.

## Testing
- landing, signup and mascot tests keep their roles.
- tsc, eslint, prettier and vitest.
- Screenshots at 1440 and 390, with no horizontal scroll.
