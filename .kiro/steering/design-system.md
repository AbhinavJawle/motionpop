---
inclusion: fileMatch
fileMatchPattern: ["apps/web/**/*.tsx", "apps/web/**/*.css"]
---

# App design system (the UI, not the scenes)

The app is a premium creative tool. Dark, calm, uncluttered, so the user's colourful scenes are the brightest thing on screen.

## Look
- Dark neutral surfaces (near-black, slightly cool). No saturated colour in chrome except one brand accent for the primary action and focus rings.
- shadcn/ui components on Tailwind 4, themed via CSS variables in `globals.css`. Don't hand-roll a component that shadcn has.
- Type: one sans family for UI; tabular numerals for timecodes and numbers.
- Spacing on a 4px grid (Tailwind default scale). Radius: small and consistent.
- Icons: `lucide-react`.

## Layout
Desktop-first studio: left rail (projects, library), centre canvas (Player + format switcher), right inspector, bottom prompt bar with plan chips. See `docs/product-spec.md` §11.

## UI motion
- Framer Motion for UI only, never inside Remotion scenes.
- Durations 120–240ms, ease-out. No bounce. Respect `prefers-reduced-motion`.

## Copy
- Speak human: "Make it more dramatic", not "increase easing coefficient". Pro terms only in Advanced mode.
- One primary action per screen (Generate → Save → Export).
- Empty states teach: an example prompt and what will happen.

## Accessibility
Keyboard reachable, visible focus, labels on icon buttons, WCAG AA contrast.
