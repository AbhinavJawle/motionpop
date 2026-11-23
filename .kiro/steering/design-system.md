---
inclusion: fileMatch
fileMatchPattern: ["apps/web/**", "design/**"]
---

# Design system

**Source of truth:** `design/screens/*.png` and `design/figma-export.css`. Match them exactly. When this file or any doc disagrees with the designs, the designs win. Frames are 1440 wide (the PNGs are 2× exports, so divide PNG pixels by 2). The CSS is absolute-positioned Figma output: use it for exact sizes, colours, radii, shadows, gradients and type, not as code.

## Feel
Dark, sleek and premium, with a poppy, playful layer on top. Calm surfaces, generous spacing, precise alignment. Soft light: low-opacity glows, 1 px top highlights, ember and violet blooms. Everything that can react, reacts (springy hover, press, Pip). Never neon or loud in the chrome.

## Colour tokens (from the CSS)
| Token | Value | Use |
|---|---|---|
| `bg` | #08080C | app background |
| `bg-raised` | #111118 | top bar, timeline header |
| `panel` | #0F0F15 | panels, rail |
| `card` | #15151D | cards, inputs |
| `card-2` | #191820 / #232130 | nested cards, hover |
| `glass` | rgba(21,21,29,0.7) | toolbars, overlays (blur 16px) |
| `border` | rgba(255,255,255,0.08) | hairlines (most common) |
| `border-soft` | rgba(255,255,255,0.05) | quiet dividers |
| `border-strong` | rgba(255,255,255,0.12) | emphasis |
| `text` | #F4F3F8 | primary text |
| `text-2` | #A09EAE | secondary |
| `text-3` | #817A8F | tertiary, labels |
| `text-4` | #56505F | disabled, ruler ticks |
| `ember` | #FF7A3D | primary actions, "now", playhead, credits |
| `ember-soft` | rgba(255,154,100,0.9) | ember text on dark |
| `ember-grad` | linear-gradient(90deg, #FF7A3D, #FF4D6D) | Export, Download, big CTAs |
| `ember-fill` | linear-gradient(180deg, #FFA064, #FF683C) | highlighted bar, stop button |
| `violet` | #8B7CFF | AI, selection, cloud, toggles |
| `violet-fill` | linear-gradient(180deg, #8070DA, #554496) | Generate, Apply all |
| `mint` | #3DDC97 | on-device, success, saved, ready |
| `warn` | #FFC24B | warnings |
| `error` | #FF5A5F | errors, note dot |
| `pip-face` | #302D3D | Pip eyes and smile |

**Colour discipline:** ember = now / primary / credits, violet = AI / selection / cloud, mint = on-device / success / status. Nothing else in the chrome. Style-pack colours appear only inside previews and thumbnails.

## Typography
- Geist for UI, Geist Mono for numbers, timecodes, credits, durations, file meta ("MP4 · H.264 · 30 fps").
- Scale at 1440: body 13 px, small 12 px, labels 11 px, micro 9–10 px; panel titles 15–17 px; inspector title 19 px; modal titles ~26 px; page headlines 32–40 px semibold, tight tracking.
- Uppercase section labels (GRAPHIC, CONTENT, SLOTS, YOUR CREATIVE SPACE): 9–11 px, letter-spacing 0.8–1.4 px, `text-3` (or ember for page eyebrows).
- Tabular figures for every number.

## Shape and depth
- Radius: 10 px buttons/inputs/chips-in-cards, 12 px cards and panels, 16–20 px modals, full pills for format switcher, toggles, scope chips, capture bar.
- **Glass shadow (default card):** `0 8px 24px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.08)`.
- Quiet card: `inset 0 1px 0 rgba(255,255,255,0.05)`.
- Ember glow (primary): add `0 4px 20px rgba(255,122,61,0.18)`. Violet glow (AI): add `0 4px 16px rgba(139,124,255,0.14)` or `0 0 18px rgba(139,124,255,0.12)`.
- Preview frame card: `linear-gradient(110.56deg, #252334, #121219 91%)` with a vignette `radial-gradient(50% 50% at 50% 50%, transparent, rgba(0,0,0,0.24))`.
- Ambient ember bloom behind Pip and hero moments: `radial-gradient(50% 50% at 50% 50%, rgba(255,122,61,0.19), rgba(255,122,61,0.07) 55%, transparent)`.

## Layout (editor, 1440×900)
Top bar 56 · rail 72 · left panel 340 (only when a rail item is open; collapse chevron on its right edge; preview shrinks, inspector stays) · preview workspace centred · inspector 360 at x = 1080 · timeline 300 at y = 600, full width, never covered.

## UI motion (poppy, but purposeful)
- Defaults: springs (`stiffness 400, damping 30`) for press/hover/toggles; 200–280 ms ease-out for fades and panel slides.
- Buttons: lift 1 px + glow on hover, press to 0.97 scale. Chips pop in with a small overshoot.
- Suggested slots breathe (slow glow). Generating slots shimmer (diagonal sweep). Selected slot: violet→ember gradient border + bloom.
- Panels slide + fade 240 ms. Modals scale from 0.96 with backdrop fade. Toasts slide up with a spring.
- Numbers (credits, stats, timers) roll when they change.
- Pip reacts to state everywhere (see `pip-mascot.md`).
- `prefers-reduced-motion`: no breathing, shimmer, floating or confetti; keep instant state changes.

## Key components
Format switcher pills · Brand kit chip (star + three colour dots) · Credits chip (⚡ + mono number; dashboard: ✦ "120 credits") · Export gradient button with dropdown · Rail item (icon + label; active = violet-tinted pill) · Slot card (suggested, generating, ready, selected, has-note, failed) · "You said" card (violet left bar) · Prompt box with Generate · Cost chips (`⚡ free · on-device` mint, `☁ 3` violet) · Quick edit input · Data table with colour dots · Style row with mini preview · Ease curve picker · Version thumbnails · Glass toolbar · Frame note (violet ellipse + numbered bubble + leader line) · Pip bubble · Capture bar · Stat tile with sparkline · Project card with status chip · Toasts · Toggles (violet on).

## Copy rules
Short, warm, confident. Use the exact strings from the designs. No third-party brand or creator names anywhere.

## Spec 38 (2026-11-22, D-086): the editor is paper too
The editor now uses the paper language of spec 35 (`[data-paper][data-editor]` on its root). The dark tokens above describe the old studio and apply only where no screen marks itself paper. In the editor:
- The top bar is the black film-strip bar.
- Panels, inspector and timeline are paper edged in 2 px ink.
- The video preview stays a black screen in an ink frame.
- Pip leads the rail, and its panel is open on load with the glowing Pip (`components/pip-panel/pip-orb.tsx`) at the centre of an empty conversation.
- Active rail items are ink tiles.
- The selected slot lifts on a Pip-blue fill with a 3 px hard shadow.
- Play and the playhead are ember.

## Spec 38 follow-up (2026-11-23, D-087): night desk by default
The editor opens dark. The paper look is the light option, behind a top-bar toggle. Theme-aware tokens:
- `paper`, `ink` and `mist`.
- `edge` (frame borders), `rule` (panel edges) and `hard` (offset shadows).
- `tile` (raised inverse tiles).
- `voice`/`voice-2` (green) and `sound`/`sound-2` (cyan → blue).

Use these, not literal `#000`, inside editor markup. On orange fills use `text-black`/`border-black`; on violet or black fills use `text-[#fff]`.
