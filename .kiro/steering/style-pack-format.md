---
inclusion: fileMatch
fileMatchPattern: ["packages/styles/**"]
---

# Style pack format

One pack per file: `packages/styles/src/packs/<pack-id>.ts`, exporting a value typed by `StylePackSchema`.

## Tokens
- **palette roles:** `background`, `surface`, `text`, `primary`, `accent`, `positive`, `negative`, `muted`. Components refer to roles only.
- **typography:** `display`, `body`, `numerals` font families (open licence only, recorded in `LICENSES-ASSETS.md`), plus weights.
- **easing:** `enter`, `exit`, `emphasis` as cubic-bezier tuples `[x1, y1, x2, y2]`. All values in 0–1 (no overshoot; see motion principles).
- **durations:** `enter`, `exit`, `hold` in seconds.
- **background:** `solid | gradient | grain | grid` with parameters.
- **camera:** default behaviour `static | drift | push`.

## Brand kit mapping
A brand kit never adds new tokens. It overrides existing roles: brand primary → `accent`, optional secondary → `primary`, brand font → `display`. After the override, re-run the contrast check and fall back to the pack's original colour for any role that fails.

## Validation (style pack validator hook and `pnpm check:styles`)
- Parses with `StylePackSchema`.
- `text` on `background` and `text` on `surface` meet WCAG AA (4.5:1); `accent` on `background` meets 3:1.
- Easing values in range; durations positive.
- Name and description are descriptive. No brand, channel or creator names.
