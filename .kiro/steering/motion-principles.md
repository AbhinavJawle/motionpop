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
6. **Hierarchy.** One focal point per frame. Purposeful secondary motion is allowed around it (parallax, follow-through, settle, decoration draws), within the project's energy setting (D-028).
7. **Camera.** Subtle continuous push-in (scale 1.00 → 1.04–1.06) on most scenes. Transitions are motion-driven (zoom, slide, match), not hard cuts.
8. **Counters** ease out and land exactly on the final value; the final value gets an accent (highlight swipe or colour).
9. **Data honesty.** Chart geometry is proportional to the data from a zero baseline (unless explicitly a delta chart). Labels show exact values.
10. **Safe areas.** Text inside 5 % margins (16:9 and 1:1). 9:16 keeps clear of platform UI: top 12 %, bottom 20 %, sides 6 % (common short-video overlay zones, measured from the main platforms' layouts; revisit if they change). Captions are an overlay positioned by spec 12, not a band components must avoid. `safeArea()` in `core/safe-area.ts` is the single source.
11. **Typography.** At most 2 type sizes per frame besides labels; tabular figures for numbers; no orphans in headlines.
12. **Exit.** Elements leave faster than they enter (≈ 60 % of the entrance duration), or hand off via a transition.
13. **Sync.** The slot's focal element lands on the spoken word (word start ± 80 ms).
14. **No meaningless loops.** Motion performs a job. Secondary motion must be purposeful; nothing loops just to look busy (D-028).
15. **Determinism.** Same params + same t = identical frame. Always.
16. **Read time.** After a text block lands it is not moved or covered for its read time (at least 0.8 s, plus 0.2 s per word beyond three), and it stays on screen at least that long. While any text is in its read time, engine-added motion is slow and non-covering only: a camera push of at most 3 %, background parallax, texture drift. Scene content is not held back: other elements may enter beside text being read, and a cue lands on its spoken word (rule 13) (D-028, D-029, D-031).
17. **Beats follow energy.** A visible change at least every 3.0 s (calm), 2.2 s (steady), 1.6 s (lively) or 1.1 s (hype). Calm lessons get slower beats. The engine fills gaps; it never breaks rule 16 to do so.
