# Spec 38 design: the paper editor

> Claude Code session, 2026-11-22.

## Idea
The dashboard is a desk with a storyboard on it. The editor is the same desk with the take on it:
the black film-strip bar on top, paper all round, the video on a black screen in an ink frame, and
Pip glowing on the left where you talk to it. One bold thing: the glowing Pip. Everything else is
quiet ink on paper.

## Tokens
Same as spec 35 (paper #fff, ink #000, mist #f3f3f1, ember #ff6a3d, Pip blue #8dbceb, violet
#6b5cf0 for cloud, mint for on-device). The editor marks its root `[data-paper]`, so the shared
tokens turn to paper. The editor-only tokens spec 35 never needed get paper values in the same block:
`track-a/b/hair`, `slot-*`, `rail-active`, `reason`, `time-dim`, `zoom-*`, `knob`, `synced`, `sfx`,
`music`, `curve`, `glyph`, `bolt`, `style-ink`, `ready-ink` and the `shadow-*` set.

## Layout
```
▓▓▓▓▓▓▓▓ black film strip ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
 (pip) ‹ PROJECTS / UNTITLED PROJECT  saved     [16:9|9:16|1:1]     ↶ ↷ ⟲  brand 120 [EXPORT ▾] ◉
┃rail┃ Pip panel (360)          ┃ desk                                       ┃ inspector ┃
┃PIP ┃        ░░░░░░░           ┃       [ ✎ look · CC · safe ] toolbar        ┃ (on select)┃
┃voice┃     ░░ (pip) ░░         ┃   ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓▀▀     ┃           ┃
┃style┃       ░░░░░░░           ┃   ┃          black screen          ┃         ┃           ┃
┃ …  ┃  WHAT SHOULD WE CHANGE?   ┃   ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛         ┃           ┃
┃    ┃  [chip] [chip] [chip]     ┃                                            ┃           ┃
┃    ┃ ┏ Ask Pip anything… ━━┓▀  ┃                                            ┃           ┃
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 2 px ink rule ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 TRANSCRIPT  voiceover 18.0s   [+ add graphic]      ⏮ ▶ ⏭  00:02.4 / 00:18.0      [film] – ○ +
 0s      2s ▼     4s       6s …                                       (ember playhead)
 Graphics  ┌hook ┐   ┌stat ┐▀  ┌map  ┐                   ← ink frames, selected lifts
 Words     Let's look at the numbers. Our revenue grew …
 Voice     ▌▌▌ ▌▌▌▌ ▌▌ ▌▌▌▌▌                               ← ink waveform
 Sound     ♫ add music   · tick   · whoosh
```
Left aligned throughout except the empty Pip state, which centres on the orb.

## The glowing Pip (`components/pip-panel/pip-orb.tsx`)
- Three blurred colour blobs (Pip blue, violet, ember) circle behind the code-drawn `Pip` on 9–14 s
  loops, with a white core so Pip's face stays readable. A soft ring breathes on a 4.2 s loop.
- `mood`: `idle | listening | thinking | done` maps to Pip's state and to CSS variables (speed,
  brightness, spread). `thinking` adds a slow conic sweep.
- Sizes: 148 px in the empty state, 28 px in the header once messages exist.
- Transform and opacity only; `prefers-reduced-motion` stops every loop.

## Surfaces
- **Top bar**: black bar with the paper kit's sprocket edges (`paper.bar`), PipMark home link,
  Bebas breadcrumb ("PROJECTS / TITLE"), format pills as ink-on-white segments, ember Export
  (`btn('flame','sm')` look), paper credits and brand chips with white ink.
- **Rail**: paper, `Pip` first (the plush mark as its icon), the active item an ink-filled tile.
- **Pip panel**: 360 px, open on load. Header: small orb, "Pip" in Bebas, thread menu. Messages:
  Pip's replies in Patrick Hand bubbles is too much for long text, so replies stay Geist Mono with a
  Pip-blue rule; plan cards are ink frames with an ember "Apply all".
- **Preview**: the desk (dot grid and lights) around a black screen with a 2 px ink frame and a
  6 px hard shadow; the floating toolbar is a paper pill with a hard shadow.
- **Timeline**: paper with a 2 px ink top rule; Bebas clock; tracks split by ink hairlines; slot
  frames 2 px ink, 8 px radius, selected = Pip-blue fill and 3 px hard shadow; ember playhead.
- **Inspector / panels / export**: token-driven; the few hard-coded dark colours become tokens.

## Review against defaults
- Ink on paper with one hot accent continues the approved outside screens; this brief pins it.
- Bebas is not put on every label: track names, buttons and meta stay sentence-case Geist Mono.
- The glow is the only decoration; no gradients elsewhere in the chrome.

## Testing
- Unit: the orb maps every mood to a Pip state and is still under reduced motion; the Pip panel
  opens by default; existing editor, timeline, inspector and Pip panel tests keep their roles.
- Screens: `/editor/demo` at 1440×900 and 1920×1080 (empty Pip, a plan, a selected graphic).
