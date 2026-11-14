---
inclusion: fileMatch
fileMatchPattern: ["packages/motion/**", "skills/**", "services/render/**"]
---

# Motion principles for video graphics (the quality bar)

These apply to every motion component and every AI-generated composition. The HyperFrames skills (`motion-doctrine`, `cut-the-curve`) in `.kiro/skills/` go deeper; where they conflict with these rules, these rules win for Motionpop.

1. **Purposeful entrances.** Slide + fade, mask reveals, stroke draws, scale from 96 %. Never pop in. Never fade-only for everything.
2. **Easing.** Entrances use decisive out-curves (`outExpo`, `outCubic`, `outQuart`). Camera moves use gentle in-out. No elastic bounce unless the style pack sets `allowPlayful`.
3. **Overlap.** The next element starts before the previous finishes (offsets 0.15–0.35 s).
4. **Stagger.** Letters/words 0.03–0.08 s · bars/items 0.06–0.12 s · dot grids 0.01–0.04 s.
5. **Hold.** Every key line or number holds 0.8–1.2 s fully readable before leaving.
6. **Hierarchy.** One focal point per frame. At most 2–3 things moving at once.
7. **Camera.** Subtle continuous push-in (scale 1.00 → 1.04–1.06) on most scenes. Transitions are motion-driven (zoom, slide, match), not hard cuts.
8. **Counters** ease out and land exactly on the final value; the final value gets an accent (highlight swipe or colour).
9. **Data honesty.** Chart geometry is proportional to the data from a zero baseline (unless explicitly a delta chart). Labels show exact values.
10. **Safe areas.** Text inside 5 % margins (16:9) and inside platform safe zones for 9:16.
11. **Typography.** At most 2 type sizes per frame besides labels; tabular figures for numbers; no orphans in headlines.
12. **Exit.** Elements leave faster than they enter (≈ 60 % of the entrance duration), or hand off via a transition.
13. **Sync.** The slot's focal element lands on the spoken word (word start ± 80 ms).
14. **No idle wobble.** Motion performs a job; nothing loops or breathes inside a video just to look busy.
15. **Determinism.** Same params + same t = identical frame. Always.
