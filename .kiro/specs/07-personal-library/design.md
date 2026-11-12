# Design: Personal Library, Auth & BYOK

## Auth
- Cognito User Pool + Google IdP; Hosted UI or Amplify Auth UI.
- Next.js middleware verifies the JWT (aws-jwt-verify) and injects `workspaceId` (custom claim or lookup).
- `requireWorkspace()` helper in server code; repos take `workspaceId` as a mandatory arg.

## DynamoDB (single-table sketch)
| Entity | PK | SK |
|---|---|---|
| Workspace | `WS#<id>` | `META` |
| LibraryItem | `WS#<id>` | `LIB#<itemId>` |
| Project | `WS#<id>` | `PRJ#<id>` |
| Feedback | `WS#<id>` | `FB#<sceneVersionId>` |
GSI1 for tag lookups: `GSI1PK = WS#<id>#TAG#<tag>`, `GSI1SK = LIB#<itemId>`. MVP scale allows filtering in memory for component/style/skill.

## LibraryItem (extends technical-architecture model)
```ts
{ id, workspaceId, type: 'scene', name, tags, isReference, refSceneId, snapshot: { scene: Scene },
  summary: { component, skill, stylePack, duration, cameraSummary, emphasis }, thumbnailUrl }
```

## Thumbnails
Generate a still at ~60% of the duration with Remotion `renderStillOnLambda`; store in S3; async after save (placeholder until ready).

## Reference retrieval
Score = 3·(same component) + 2·|tag overlap| + 1·(same intent kind) (+ bonus if named in prompt via fuzzy name match). Top 3 summaries go into the planner's dynamic block. No embeddings for MVP.

## Naming/tagging
Haiku call returns `{name, tags[≤5]}` via structured output.

## BYOK
```
PUT /api/settings/byok  {key}
  → test call (cheap Haiku request) → KMS Encrypt → store ciphertext ref in Workspace.byokKeyRef
DELETE /api/settings/byok
```
`resolveProvider(workspace)` decrypts in memory per request; never serialised to logs (log redaction on `key`, `authorization`). Responses never include the key; UI shows only "••••last4" stored separately.

## Rate limiting
Token bucket in DynamoDB (or Upstash) keyed by user id; 429 with `Retry-After`.

## Feedback
`POST /api/scenes/:id/feedback {versionId, rating, reason?}`.

## Testing
- Repo tests ensure every query includes workspace scope (cross-workspace access returns nothing).
- Reference scoring unit tests with fixtures.
- BYOK test: invalid key rejected, key never present in API responses or logs (assert via log spy).
