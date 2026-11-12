# Design: Render & Export Pipeline

## Architecture
```
Scene JSON ──► SceneComposition (packages/components) ──► Remotion Player (apps/web)
                         │
                         └──► Remotion Lambda (packages/render) ──► S3 ──► CloudFront
```

## Packages
- `packages/components/src/SceneComposition.tsx`: Remotion composition, input `{ scene, styleTokens, brandKit? }`.
- `packages/components/src/registry.ts`: `Record<ComponentType, ComponentEntry>` (filled by spec 02).
- `packages/render`: `createRenderJob`, `getRenderProgress`, Lambda deploy script.
- `apps/web/src/app/api/render/route.ts` (POST create), `.../[id]/route.ts` (GET status).

## Key types
```ts
type ComponentEntry = {
  id: ComponentType;
  propsSchema: z.ZodTypeAny;
  Component: React.FC<{ props: any; tokens: StylePack; direction: Direction; format: FormatConfig }>;
};
```

## Composition input
`calculateMetadata` computes `durationInFrames`, `width`, `height`, `fps` from the scene so the Player and Lambda agree.

## Render flow
1. API validates `SceneSchema` and the component props schema.
2. Create `RenderJob` (DynamoDB, `pending`).
3. `renderMediaOnLambda({ composition: 'Scene', inputProps, codec: 'h264' })`.
4. Client polls `GET /api/render/:id` every 1s; server calls `getRenderProgress`.
5. On done: copy/expose S3 object through CloudFront signed URL.

## Error handling
| Failure | Behaviour |
|---|---|
| Unknown component | Error frame + `UNKNOWN_COMPONENT` |
| Zod failure | 400 with field errors, no job created |
| Lambda failure | job `failed`, message stored, retry button |

## Testing
- Property test: for random valid scenes, `durationInFrames === round(duration*fps)`.
- Determinism test: render frame N twice, compare pixels (test-frame render).
