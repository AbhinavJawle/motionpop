# Spec 15 · design

## 1. The `custom` component (`packages/motion/src/components/custom/`)
- `params`: `{ title, brief?, html, css, script, keyMomentMs? }` with the R2.1 limits. `formats`: all three; `durationMs` 1.5–12 s.
- `build(ctx, p)`: `root` gets a wrapper `div.mpc` with `p.html`; `p.css` is scoped by prefixing every selector with `.mpc-{seed}` and injected in a `<style>` inside the root. The script runs as `new Function('root','ctx','mp', ...BLOCKED, body)` called with `undefined` for every blocked global (`window document globalThis self parent top frames Date setTimeout setInterval requestAnimationFrame fetch XMLHttpRequest WebSocket localStorage sessionStorage indexedDB eval Function`) and a `Math` without `random`. It must return `{ seek(tMs) }`; anything else fails the build (the engine's placeholder shows).
- `ctx` given to the script: `{ width, height, format, durationMs, keyMomentMs, colors{bg,ink,accent,accent2,muted}, fonts{display,body}, words[{text,startMs,endMs}] }`, all frozen.
- `mp` helpers (frozen, pure): `clamp, lerp, ease{linear,inOut,out,in,back,spring}, progress(t,start,end), stagger(i,n,each), count(value,decimals,p)`, `rng(seed)` (seeded, deterministic), `el(tag, attrs, text)` (creates inside `root`), `fit(el, maxWidth)`.
- This guard is about determinism, not security. Security is the sandbox (R3.2) and the render container.

## 2. Lint (`packages/motion/src/components/custom/lint.ts`)
`lintCustom({ html, css, script }) → string[]`: regex checks for R2.2 on the raw strings (comments stripped first). Used by the router's `check` (so a problem triggers the one repair) and again before saving.

## 3. `custom.compose` (`packages/ai/src/tasks/custom-compose.ts`)
ONLY_IN_CLOUD, `modelStrong`, cost `costOf('custom')`, `thinking: 'MEDIUM'`. Input `{ brief, words (text + relative ms), durationMs, format, look { name, colors, fonts } }`. Output schema R2.1 + JSON schema for structured output. `check` = `lintCustom` + "script must contain `seek`". Prompt `custom-compose.v1.ts`: the contract, the helper list, the rules, one complete example.

## 4. Web
- `lib/slots/custom.ts` `generateCustom(deps, slotId)`: spend `custom` → `router.run('custom.compose')` → `lintCustom` again → command `applyCustom(slotId, params)` (componentId `custom` + new version, one undo) → refund on any failure. Fake router: a canned, valid composition built from the brief's words.
- Prompt box: a secondary "Custom" button with ☁ 3 beside Generate.
- Preview: `sandbox-origin="opaque"` when any slot is `custom`.

## 5. Testing
Lint table test; the custom component through `assertSeekPure` with the example script; blocked globals are `undefined` inside the script; the task's `check` triggers repair; `generateCustom` refunds on failure (fake router).
