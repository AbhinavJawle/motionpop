# Design: Component Library

## Layout
```
packages/components/src/
  registry.ts
  catalog.ts                 # generateCatalog()
  shared/                    # useTokens, useDirection, layout, text-fit, format-number, seeded-random
  number-reveal/ {index.tsx, schema.ts, story.tsx, catalog.ts, *.test.ts}
  bar-chart/ ...
```
Each component folder exports `entry: ComponentEntry`.

## Shared primitives
- `useTokens()`: returns StylePack tokens from context; throws if missing.
- `useDirection()`: returns `{ progress(t), holdAt, reveal, emphasis }` derived from `Direction`.
- `useLayout()`: from `FormatConfig` returns safe-area rect and a scale factor; components compose from it for responsive re-layout.
- `fitText(text, box, minSize)`: deterministic text sizing (no DOM measurement at render).
- `formatNumber(value, {locale, currency, compact})`.
- `seeded(seed)`: mulberry32 PRNG.
- `Camera`: wrapper applying `CameraKeyframe[]` with token easing.

## Schema pattern (example: number-reveal)
```ts
export const NumberRevealPropsSchema = z.object({
  value: z.number(),
  prefix: z.string().default(''),
  suffix: z.string().default(''),
  label: z.string().optional(),
  delta: z.object({ value: z.number(), direction: z.enum(['up','down']) }).optional(),
  context: z.string().optional(),
  locale: z.string().default('en-US'),
  currency: z.string().optional(),
});
```
All schemas live in `@motionpop/schemas` (`components.ts`); component packages import them.

## Timing
All animation derives from `useCurrentFrame()` and `progress = frame / durationInFrames`. Skills give percentages; `useDirection` converts to frames. Easing from token bezier arrays via `Easing.bezier`.

## Map/Globe
Use `@react-three/fiber` via `@remotion/three` with Natural Earth country shapes (public domain). Country lookup by ISO code.

## Catalog
`generateCatalog()` uses `zod-to-json-schema` for each schema, plus `examplePrompts` and `compatibleSkills` from each folder's `catalog.ts`. Output is stable-sorted JSON so it caches well for the planner (spec 04). A test asserts all registry ids have catalog entries.

## Testing
- Property tests (fast-check): any schema-valid props render without throw for each format; final displayed number equals input; text boxes within safe zone.
- Test-frame render at 3 timestamps per component per format (snapshot-free; assertions via check functions from spec 08).

## Build order
number-reveal → bar-chart → kinetic-text → line-chart → comparison-split → logo-sting → timeline → map-globe. Craft quality on the first two before scaling out.
