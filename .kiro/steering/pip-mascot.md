---
inclusion: fileMatch
fileMatchPattern: ["apps/web/components/pip/**", "apps/web/components/**/pip*"]
---

# Pip (mascot)

Pip is Motionpop's original ghost and the face of the AI: friendly, minimal, a little cheeky, never scary. Built **in code** as SVG and animated with `motion` (UI only). No Rive, no image files. One exception (D-079): the landing sign-up CTA uses the plush Pip as matted image layers, animated with `motion` (`components/landing/pip-cta-mascot.tsx`, spec 31).

## Look (match the designs)
- Soft bean/ghost body, slightly tilted, rounded top, with a wavy bottom edge of 2–3 soft lobes (one trailing lobe gives a sense of drift).
- Body fill (exact, from the CSS): `linear-gradient(98.93deg, #DDD9EF 6.56%, #F5F2FA 31.06%, #FFFEFA 57.31%, #FFFDF7 83.56%, #FFE5CE 91.43%, #F7BC8C 94.06%)`: lavender shade on the left, warm white middle, peach/ember rim light on the right edge.
- Face `#302D3D`: two vertical oval eyes, small curved smile. Expressions change by morphing eye and mouth paths.
- Soft ember glow under Pip (ambient bloom) on hero placements.
- Arms: small rounded stubs, only when needed (catching, waving, celebrating, holding props).
- Props (separate SVG groups): violet nightcap with a pom (after 23:00 local time), popcorn bucket (Continue card), lavender cloud (sleeping), ember sound arcs (Start, Recording), violet sparkles (thinking, generating), confetti (ready), tiny pumpkin (Oct/Nov, optional), empty pockets (out of credits), tiny mic (script voice).

## Component API
```tsx
<Pip
  state="idle" | "listening" | "thinking" | "done" | "celebrating" | "sleeping" | "waking" | "catching" | "caught" | "waving" | "empty-pockets"
  size={number}            // px height
  look={{ x, y }}          // -1..1, optional cursor follow
  props={["nightcap", "popcorn", "cloud", "arcs", "sparkles", "confetti", "pumpkin", "mic"]}
  glow={boolean}
/>
```
Plus `<PipAvatar />` (face only, for the logo, avatar fallback and rail).

## States
| State | Where | Motion |
|---|---|---|
| idle | default | float ±4 px over 3 s (spring loop), blink every 3–6 s (random but seeded per mount), slight sway |
| listening | recording, typing to Pip | leans in, eyes widen, sound arcs pulse with mic level |
| thinking | AI working | sparkles orbit, gentle bob, eyes look up-side |
| done | AI finished | squash-and-stretch bounce, mint flash |
| celebrating | export ready | jump, arms up, confetti burst |
| sleeping | empty dashboard | eyes closed (arcs), slow breathing scale, floating "z z z" |
| waking | hover/click while sleeping | one eye opens → stretch → points to the capture bar |
| catching | file dragged over the page | arms open, wobble, bubble "Drop it, I'll catch it!" |
| caught | file dropped | catch, tiny spin, then hands off to processing |
| waving | sign-in, New project hover | wave |
| empty-pockets | out of credits | pockets out, sheepish smile |

## Where Pip appears
Logo and avatar (face) · dashboard header (cursor follow, nightcap at night) · Continue card edge (popcorn) · empty / drag-over cards · Start and Recording (arcs) · Processing · editor rail with status bubble · Pip panel orb · generating panel (sparkles) · export progress and Ready modal (confetti) · sign-in · out of credits · landing.

## Rules
- Purely decorative + status: never blocks clicks (`pointer-events: none` except where Pip is interactive, e.g. waking).
- `prefers-reduced-motion`: static pose per state, no floating, no confetti.
- Copy is short and warm: "Pip is thinking…", "3 slots ready", "I've got the small stuff.", "Drop it, I'll catch it!", "Pip needs a recharge".
- Pip is UI only and never appears inside exported videos (unless a future brand-sting uses a static version).
