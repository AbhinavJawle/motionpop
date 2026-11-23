# Spec 33 · Editor studio system (design)

> Claude Code session, 2026-11-22.

## Approach
Change token values in `apps/web/styles/globals.css` instead of renaming tokens, so every surface that already uses them moves together; then pass over each editor surface.

- **Tokens:** graphite ramp (#0a0a0c → #27272d), text #f4f4f6 / #a4a4ae / #80808a / #56565e; purple-tinted tokens (violet-sel, rail-active, reason, slot-*, track, dialog-*, toggle-off, avatar) neutralised. New `shadow-pop` for menus, toolbars and bubbles; `shadow-violet-glow` becomes a focus ring. `label-caps` becomes sentence case (dashboard eyebrows add `uppercase` to keep their look).
- **Buttons:** sizes sm 28 / md 32 / lg 36; new `solid` variant (white) for panel actions.
- **Top bar:** `top-bar.tsx` rewrite; `SegmentedPills size="sm"`.
- **Panels:** shared header markup in each panel body; Styles gallery (`styles-panel.tsx`); Pip panel suggestions, scope tabs and composer (`pip-panel.tsx`).
- **Inspector:** header, you-said, prompt box, quick edit, content fields (hairline table), style, timing, versions, picture, placement and generating sections.
- **Export:** `option-cards.tsx`, `options-view.tsx`, `switch-row.tsx`.
- **Dock:** `pip-dock.tsx` bubble timing keyed on `working`.

## Testing
- Unit: `inspector-body.test.tsx` order updated for the new header.
- E2E: `editor-design.spec.ts` compares against `e2e/baselines/editor-studio.png` (2/2/4 % thresholds); `export-design.spec.ts` sizes updated to 44/40/44 px.
