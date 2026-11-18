---
inclusion: fileMatch
fileMatchPattern: ["packages/motion/**", "services/render/**", "packages/ai/src/tasks/custom*"]
---

# Motion component contract

Every library component in `packages/motion/src/components/<id>/` implements:

```ts
export interface MotionComponent<P> {
  id: string;                        // "bar-chart"
  name: string;                      // "Bar chart"
  category: "data" | "map" | "text" | "callout" | "brand" | "transition";
  params: z.ZodType<P>;              // every field has .describe(); the AI reads it
  defaults: P;
  durationMs: { min: number; ideal: number; max: number };
  formats: Array<"16:9" | "9:16" | "1:1">;
  keyMomentMs: (p: P, durationMs: number) => number; // offset where the focal element lands
  build: (ctx: BuildContext, p: P) => Composition;    // creates DOM/SVG, returns a seekable composition
}

export interface BuildContext {
  root: HTMLElement;                 // container sized to the frame
  width: number; height: number;     // frame size in px (e.g. 1920×1080)
  format: "16:9" | "9:16" | "1:1";
  style: StylePack;                  // style pack + brand-kit overrides
  durationMs: number;                // slot length
  keyMomentMs: number;               // where the spoken word lands, relative to slot start
  fps: 30;
  seed: number;                      // for seeded randomness (stable hash of the slot id)
  warn: (message: string) => void;   // non-fatal problems (truncation, overflow, short slot)
}

export interface Composition {
  durationMs: number;
  seek: (tMs: number) => void;       // MUST be pure: state at t only, no dependency on previous seeks
  dispose: () => void;
}
```

## How it plugs into HyperFrames
- The compiler (`packages/motion/src/compiler`) turns a project into one HyperFrames composition: one `.clip` per slot (`data-start`, `data-duration` in seconds derived from integer ms), audio elements, a captions host and `runtime.js`.
- `runtime.js` listens for HyperFrames' `hf-seek` event and calls `composition.seek(t - slotStart)` on every active slot. Clips outside their range are hidden.
- **No GSAP in our components** (Pireel's own compositions may use it, D-076). Do not use HyperFrames' GSAP timeline adapter. Our core (timeline, tween, eases, stagger, text split, path draw, count-up, rng, fitText) is the only animation engine.
- Verify the current `hf-seek` event shape and player API against the HyperFrames source/skills before changing the runtime.

## Rules
- **Pure function of time.** `seek(t)` sets every property from `t` alone. No `Date.now()`, timers, rAF loops, CSS animations/transitions, unseeded randomness or network.
- **Layout per format.** Each component lays itself out deliberately for each supported format (re-layout, never crop).
- **Tokens only.** Colours, fonts, radii and motion timings come from `ctx.style`. No hard-coded colours.
- **Text fitting.** Use `fitText`; never overflow the safe area. If text can't fit: shrink to a minimum, then truncate with ellipsis and flag a warning.
- **Transparent root.** Components never paint a background or a full-frame opaque fill. The compiler owns the background, texture and the transparent-export mode.
- **Camera is the compiler's.** The runtime scales a `.mp-cam` wrapper with `style.motion.camera.pushIn`; components lay text out inside `insetForCamera(safeArea(...))` and never apply the push-in themselves.
- **Check hooks.** Mark every text element `data-text` and the focal element `data-focal`. Text drawn on a token colour other than `bg` sets `data-on="<colour token>"` (for example `data-on="highlight"`) so the contrast check uses the right backdrop.
- **Assets** inline (SVG) or from bundled local files. Fonts are bundled (Geist, Geist Mono) and embedded by the compiler; the runtime calls `document.fonts.load` for each family and weight, then awaits `document.fonts.ready`, before the first build and seek. An unbundled family fails compilation.
- **Runtime API.** `window.__motionpop = { ready, seek(tMs), errors, warnings }`. One failing slot never breaks the others: preview shows a "Couldn't render" placeholder; render fails the job.
- **Each component ships with:** zod params with descriptions, defaults, per-format layouts (`layout.ts`), `samples.ts` (fast-check arbitrary + edge cases for motion:check), README with examples (and any reference provenance), unit tests, property tests (determinism via `assertSeekPure`, bounds, data honesty) and a passing `pnpm motion:check <id>`.
