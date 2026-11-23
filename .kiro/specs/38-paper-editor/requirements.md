# Spec 38 requirements: the paper editor

> Claude Code session, 2026-11-22. Founder ask: "the ui outside the editor is now so good … when i
> open the editor it feels like i opened something completely new and different unrelated … our
> editor should be agent native … see that glowing orb? i want that too, but it will be glowing pip".

Spec 35 kept the editor dark on purpose ("you leave the paper and step into the edit"). The founder
reverses that: the editor joins the paper storyboard, and Pip becomes the centre of it.

## R1 One product, one look
- R1.1 THE editor SHALL use the paper language of the screens outside it: white paper, black ink,
  2 px ink rules, Bebas Neue for titles and big numbers, Geist Mono for body text, Patrick Hand only
  where Pip speaks, ember for the one action colour, Pip blue for Pip and selection.
- R1.2 THE editor's top bar SHALL be the dashboard's black film-strip bar (sprocket edges, Bebas
  title, ember Export button that presses into its shadow).
- R1.3 Menus, dialogs, toasts and popovers opened from the editor SHALL render as paper (they already
  follow the paper tokens once the editor is marked `[data-paper]`).
- R1.4 THE video preview SHALL sit on a black screen inside an ink frame, so the graphics are judged
  against the same black they are exported over, never against paper.

## R2 Agent-native: Pip first
- R2.1 WHEN the editor opens THE Pip panel SHALL be open, and the rail's first item SHALL be Pip.
- R2.2 WHILE the conversation is empty THE panel SHALL show a glowing Pip: the mascot floating in a
  soft light of Pip blue, violet and ember, with the project summary, the question "What should we
  change?" and the free suggestion chips.
- R2.3 THE glow SHALL answer the conversation: idle → a slow breath; typing → Pip listens and the
  light brightens; a plan is being made → Pip thinks and the light turns faster; a plan applied →
  Pip is done. Reduced motion shows the still pose and a still glow.
- R2.4 WHILE the conversation has messages, a small glowing Pip SHALL stay in the panel header,
  carrying the same states.
- R2.5 THE composer SHALL be the dashboard capture bar's twin: a thick ink frame with a hard shadow.

## R3 The rest of the editor
- R3.1 THE timeline SHALL be paper: tracks split by ink hairlines, graphics as ink-ruled frames,
  the selected graphic lifted on a hard shadow, the playhead in ember, the clock in Bebas.
- R3.2 THE inspector, rail panels, export dialog and dock SHALL read as paper with no dark leftovers.
- R3.3 Nothing changes in behaviour: every control keeps its role, name and position in the tab order.

## R4 Quality
- R4.1 Text on paper SHALL read at 4.5:1; ink on Pip blue and ember fills at 4.5:1.
- R4.2 tsc, eslint, prettier and vitest pass; the editor is screenshotted at 1440×900 and
  1920×1080 for review.

## Follow-up (founder review, 2026-11-23)
> "its very harsh on the eyes … timeline takes a lot of space … let the sidebar cover the left side
> always … the glowing pip should be always visible … add some nice gradients … green gradients for
> voice timeline and nice cyanish blue for sound … overall it should be smooth and nice"

## R5 Night desk (dark mode)
- R5.1 THE editor SHALL open dark by default and offer a light/dark toggle in the top bar; the choice SHALL persist in this browser.
- R5.2 THE dark theme SHALL keep the paper language: poster type, mono body, frames with soft chalk edges, hard offset shadows, the film-strip bar and Pip's lights.
- R5.3 WHEN the theme switches THE colours SHALL ease rather than snap.

## R6 Full-height sidebar
- R6.1 THE rail and the left panel SHALL run the full height under the top bar; the timeline SHALL sit under the preview and inspector only.

## R7 A shorter timeline
- R7.1 THE timeline SHALL be about 244 px tall (from 300), with a 112 px label column, and its header SHALL fit narrow widths without overlap.

## R8 Track colours
- R8.1 THE voice track SHALL be a green gradient with green waveform bars where it has played; the sound track SHALL be a cyan-to-blue gradient; graphics SHALL carry a violet-to-Pip-blue sheen; each track's label icon SHALL take its colour.

## R9 Pip always in sight
- R9.1 WHILE the conversation is empty THE glowing Pip SHALL be large in the panel's centre.
- R9.2 WHEN a message is sent, or the large Pip scrolls out of view, THE glowing Pip SHALL move smoothly into the panel header, small, and stay there.
