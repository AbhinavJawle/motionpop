# Design: 02 design system and Pip

## Structure
```
apps/web/components/ui/        button.tsx, chip.tsx, toggle.tsx, input.tsx, card.tsx, glass-toolbar.tsx,
                               segmented-pills.tsx, credits-chip.tsx, brand-kit-chip.tsx, kbd.tsx, tabs.tsx,
                               slider.tsx, dropdown.tsx, modal.tsx, toast.tsx (sonner theme), tooltip.tsx,
                               shimmer.tsx, status-dot.tsx, number-roll.tsx
apps/web/lib/motion/presets.ts springs + variants (press, hoverLift, popIn, panelSlide, modal, toast, breathe, shimmer)
apps/web/components/pip/       pip.tsx, pip-avatar.tsx, parts/ (body, face, arms, props/*), states.ts, use-blink.ts, use-look.ts
apps/web/app/dev/ui/page.tsx   gallery (404 in production)
```

## Measuring the designs
For each primitive, find its layer in `design/figma-export.css` (e.g. `/* Export */`, `/* Generate */`, `/* Quick edit */`, `/* Credits */`) and copy width/height/padding/radius/shadow/gradient/font exactly. Record the CSS line reference in a comment at the top of the component file. Sizes are for the 1440 frame.

Known values (from the CSS tallies in `design-system.md`): glass shadow, ember gradient (Export, Download), violet fill (Generate, Apply all), toggle on = violet, chips 10 px radius inside cards / full pills elsewhere, labels 9–11 px letter-spaced.

## Motion presets
```ts
export const spring = { type: "spring", stiffness: 400, damping: 30 } as const;
export const press = { whileTap: { scale: 0.97 }, transition: spring };
export const hoverLift = { whileHover: { y: -1 }, transition: spring };      // + glow via CSS var
export const popIn = { initial: { scale: 0.9, opacity: 0 }, animate: { scale: 1, opacity: 1 }, transition: { type: "spring", stiffness: 500, damping: 22 } };
export const panelSlide = { initial: { x: -16, opacity: 0 }, animate: { x: 0, opacity: 1 }, exit: { x: -16, opacity: 0 }, transition: { duration: 0.24, ease: [0.22, 1, 0.36, 1] } };
export const modal = { initial: { scale: 0.96, opacity: 0 }, animate: { scale: 1, opacity: 1 }, transition: spring };
```
`useReducedMotion()` gates every looping preset.

## Pip construction
- `viewBox="0 0 120 140"`. Body: one path (rounded top, 3 bottom lobes, the right lobe trailing). Fill: an SVG `linearGradient` reproducing the Figma gradient (98.93° → x1/y1/x2/y2 computed; stops 6.56 % #DDD9EF, 31.06 % #F5F2FA, 57.31 % #FFFEFA, 83.56 % #FFFDF7, 91.43 % #FFE5CE, 94.06 % #F7BC8C). Subtle inner shadow via filter.
- Face group: two ellipses (eyes) + one path (smile), `#302D3D`. Expressions are path/ellipse attribute sets per state (open, closed arc, wide, happy squint, one-eye) interpolated by `motion`.
- Arms: two small rounded paths, hidden unless the state needs them.
- Props: separate groups positioned relative to the head (nightcap, popcorn) or behind/around (cloud, arcs, sparkles, confetti).
- States are a table `states.ts`: `{ body: variants, face: expression, arms, props, loop }`. Pip receives `state` and animates between entries.
- Blink: `useBlink` schedules with a seeded random interval 3–6 s (UI only, determinism not required, but seeded so tests are stable).
- Eyes follow: `useLook` maps pointer position to `look` (−1..1), eyes translate ±3 px with a spring.
- Glow: optional radial ember bloom under Pip (CSS gradient from `design-system.md`).

## Accessibility
Pip has `role="img"` and an `aria-label` per state ("Pip is thinking"), or `aria-hidden` when decorative next to text that already says it.

## Testing
- **[kiro]** Unit: every Pip state renders without errors, with props; reduced-motion renders the static pose.
- **[kiro]** Unit: components use tokens only (lint rule or test that greps `components/ui` for raw hex values outside `globals.css`).
- Playwright screenshots of `/dev/ui` at 1440×900 for review against the PNGs.
