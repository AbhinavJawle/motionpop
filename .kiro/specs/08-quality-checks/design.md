# Design: Deterministic Quality Checks

## Location
`packages/engine/src/checks/` with one file per check and `runChecks.ts`.

## Types
```ts
type Box = { id: string; x: number; y: number; w: number; h: number; kind: 'text'|'shape'|'media'; fontSize?: number; allowOverlap?: boolean };
type LayoutProbe = (props: unknown, tokens: StylePack, format: FormatConfig, direction: Direction, t: number) => Box[];
type Check = (ctx: { scene: Scene; boxes: Map<number, Box[]>; data?: DetectedData; format: FormatConfig }) => Issue[];
```
Each `ComponentEntry` (spec 01) gains an optional-then-required `probe: LayoutProbe`. Probes reuse the same layout math as rendering (`useLayout` pure core) so no DOM or headless browser is needed.

## Runner
```
sampleTimes = [0, .25, .5, .75, 1, direction.holdAt]  (normalised)
boxes = probe(...) per sample
issues = checks.flatMap(c => c(ctx))
```

## Check specifics
- **overflow**: box ∉ canvas or text box wider than allotted container (probe provides `container`).
- **font size**: `box.fontSize < MIN_FONT_SIZE[format]`.
- **collision**: AABB intersection area / min(areaA, areaB) > 0.02.
- **safe zone**: safe rect from `safeZones` fractions; text outside → error.
- **data match**: probe also returns `displayedNumbers: {id, text}[]` for the scene; parse via locale-aware parser; compare with `DetectedData` using tolerance = half unit of displayed precision.
- **timing**: pure numeric checks on direction and duration.

## Fix hints
`suggestedFix` provides a patch (e.g. reduce font via `/props/titleSize`, shorten text) which the engine can include in its retry prompt.

## Hook
Kiro hook `component-quality` (PostFileSave, matcher `packages/components/src/.*`) runs `npm run test -w @motionpop/components -- --run` and a `check:frames` script that renders probes for all formats.

## Testing
- Unit tests per check with hand-built boxes.
- Property test: scenes from the fallback factory pass all `error`-level checks for all formats.
- Property test: `parse(format(x)) ≈ x` for the number parser across locales.
