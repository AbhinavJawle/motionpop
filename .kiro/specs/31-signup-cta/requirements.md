# Spec 31: Sign-up CTA with Pip peeking over the edge

> Written in a Claude Code session (2026-11-22), after the work it describes. Founder brief: an animated React sign-up call to action built from two references, a composition (a wide near-black button, thin pink-to-blue border with a glow, "Sign up & create" in large off-white monospace, a diagonal arrow, the ghost peeking over the top edge with two plush hands over the border) and the plush mascot itself (to be kept exactly). The mascot is animated with Rive; the button is HTML and CSS.

## Requirements (EARS)
### R1 Button
- **R1.1** THE CTA SHALL be one real link whose accessible name is its visible text, exactly "Sign up & create" by default; the arrow and the mascot SHALL be hidden from assistive technology.
- **R1.2** THE background, border, glow, hover lift (2 px, brighter glow) and pressed state SHALL be CSS, sized from the button's width (container query units) so the composition holds from phone to desktop without horizontal scroll.
- **R1.3** WHEN a visitor focuses the link with the keyboard THE CTA SHALL show a focus ring and the hover pose.

### R2 Mascot assets
- **R2.1** THE mascot SHALL be matted from the reference with genuine transparency and its fuzzy edge kept; shape, face, colours and fur SHALL be unchanged (the open-eye layers recomposite to the original within 2/255).
- **R2.2** THE parts SHALL be: body (fur filled under the eyes), two eye layers (the original pixels of each eye socket), two plush hands made from the mascot's own fur and lighting.

### R3 Rive animation
- **R3.1** THE `.riv` SHALL hold two artboards in one coordinate space: "Pip Body" (drawn behind the button face) and "Pip Hands" (drawn in front of the border). The button SHALL NOT be in the file.
- **R3.2** Idle: a seamless 6 s loop of slow float, subtle tilt, plush compression just after settling, hands following a beat late, one blink.
- **R3.3** WHEN the view model's `hover` is true THE mascot SHALL perk up (head lifts, eyes widen a touch, paws grip); WHEN it turns false it SHALL ease back.
- **R3.4** WHEN `press` fires THE mascot SHALL dip with the button, hop, land softly and settle.
- **R3.5** Hover and press SHALL play on their own state machine layers, so the idle loop never restarts.

### R3b Shipped animation (amendment)
- **R3b.1** THE page SHALL animate the same layers with `motion` (no Rive runtime), keeping R3.2–R3.5; WHEN the visitor prefers reduced motion Pip SHALL hold still.

### R4 Page integration
- **R4.1** THE landing page's closing section SHALL show the CTA to signed-out visitors (to `/sign-in?next=/start`); signed-in visitors keep the existing button.
- **R4.2** (superseded by R3b) Rive runtime loading.
- **R4.3** (superseded by R3b) The splash watermark gate.
