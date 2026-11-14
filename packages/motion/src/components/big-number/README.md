# big-number

One number that counts up and lands exactly on the spoken word, with a highlight swipe behind it, an optional eyebrow line above and a short label below.

- **Category:** data · **Formats:** 16:9, 9:16, 1:1 · **Duration:** min 2.6 s, ideal 3.6 s, max 8 s
- **Key moment:** the number's final value first appears at the key moment (the word). Default: `min(1200 ms, 35 % of the slot)`.
- **Choreography:**
  1. The context fades and slides in.
  2. The number enters and counts for at most 1.4 s, ending on the word.
  3. The highlight swipes in.
  4. The label follows 200 ms later.
  5. The label holds for at least 800 ms.
  6. Everything exits in 60 % of the entrance time.

  All timings and eases come from `style.motion`. On short slots the entrance compresses so the hold survives.
- **Layout:** 16:9 is a left-aligned column; 9:16 and 1:1 are centred stacks. Boxes sit inside `insetForCamera(safeArea(...))` and are sized for their maximum font size, so fitting only ever shrinks text.
- **Text fitting:** the number never truncates. If even the minimum size overflows, `ctx.warn` is called and motion:check fails. The context and label truncate with "…" and warn.
- **Hooks:** `data-text` on every text element, `data-focal` on the number, `data-on="highlight"` on the number for the contrast check. The root is transparent; the runtime owns the background and camera.

## Params

| Field | Type | Notes |
|---|---|---|
| `value` | number | The number to land on, exactly as spoken |
| `prefix` / `suffix` | string ≤ 4 | e.g. `$`, `%`, `M`, `bn` |
| `decimals` | 0–2 | Decimal places shown |
| `label` | 1–48 chars | Short line under the number, at most 6 words |
| `context` | ≤ 60 chars, optional | Eyebrow line above the number |
| `countFrom` | number, default 0 | Where the count starts |

## Examples

```json
{ "value": 40, "suffix": "%", "label": "Revenue growth since 2020" }
{ "value": 2.4, "prefix": "$", "suffix": "bn", "decimals": 1, "label": "Raised in the last round", "context": "Funding" }
{ "value": -12, "suffix": "%", "label": "Drop in a single quarter" }
```

## Checks

- `pnpm motion:check big-number`: 102 cases × 3 formats (defaults, 8 edge cases, 20 seeded random samples; min/ideal/max durations; early/default/late key moments). Covers safe area, overlap, contrast, focal at the key moment, sync ±80 ms, the 800 ms hold, fonts, and the HyperFrames clock matching a direct seek.
- Unit and property tests in `big-number.test.ts`: determinism, data honesty, described params, layout boxes, hold timing.

Original component; no external references.
