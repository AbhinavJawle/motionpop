# Design: Brand Kit & Formats

## Brand kit flow
```
Upload → S3 (presigned PUT) → server fetch → palette extraction (node-vibrant / colorthief) →
role assignment heuristic → BrandKit saved → preview on sample scenes
```

## Role assignment heuristic
1. Drop near-white/near-black unless nothing else exists.
2. `accent` = most saturated of dominant colours.
3. `primary` = most frequent non-neutral colour.
4. `background` = darkest colour if the style pack is dark, otherwise lightest; fallback to pack value.
5. `text` = contrast-safe against background (≥4.5:1) chosen from white/near-black or palette.
6. `muted` = text at reduced opacity blended with background.
User can override any role in the UI.

## API
- `POST /api/brand/upload-url` → presigned URL
- `POST /api/brand` → create from `{logoKey, palette?, fonts?}` (extraction runs if palette missing)
- `GET/PUT /api/brand/:id`

## Fonts
Google Fonts list (name + weights) loaded from a static JSON; Remotion loads via `@remotion/google-fonts` so render and preview match. Only open-licence fonts.

## Formats
`FORMAT_CONFIGS` is the single source. Add to `format.ts`:
```ts
export const MIN_FONT_SIZE: Record<FormatPreset, number>;
export const PLATFORM_UI_REGIONS: Partial<Record<FormatPreset, Array<{name:string; x:number; y:number; w:number; h:number}>>>;
```
`useLayout()` (spec 02) returns safe rect and `scale = min(width,height)/1080`.

## Safe-zone overlay
SVG overlay positioned over the Player; reads `safeZones` and `PLATFORM_UI_REGIONS`.

## Loop mode
Scene `direction.loop: boolean`; components fade/return to initial state in final 10% when set.

## Testing
- Unit tests on role assignment with fixture palettes (contrast ≥ 4.5 asserted).
- Property test: switching format yields scene with identical props, only `format` differs.
- Upload validation tests (type, size).
