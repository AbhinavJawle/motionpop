# Design: Studio Editor

## Routes (`apps/web/src/app`)
```
/studio/[projectId]            # main studio
/studio/[projectId]/[sceneId]  # scene focus
/onboarding
/templates
```

## Component tree
```
StudioShell
├─ LeftRail: ProjectSwitcher, Storyboard (dnd-kit), TemplatesList
├─ CanvasPane: FormatSwitcher, ScenePlayer (spec 01), SafeZoneOverlay, VersionBar
├─ Inspector: PlanSection (chips), QuickControls, ColorRolePicker, WhyDirection
└─ PromptBar: PromptInput, ChatHistory, PlanChips
```

## State
React state + Server Actions per steering (no Redux). A `useSceneEditor(sceneId)` hook holds:
```ts
{ scene, versions, cursor, status: 'idle'|'planning'|'directing'|'validating'|'refining'|'error',
  generate(req), refine(text), applyLocal(patch), undo(), redo(), restore(versionId) }
```
Local edits (inline text, sliders) apply patches optimistically via the same `applyPatch` from the engine (shared code), then persist.

## Versions
Append-only `SceneVersion` list; `cursor` index for undo/redo. New change after undo truncates redo branch from the UI but keeps versions stored (history list shows all).

## Autosave
Debounced 800ms write of current version; `beforeunload` flush; optimistic UI with retry indicator.

## Inline text edit
Components expose `textTargets` (path → bounding box) in a studio-only overlay; clicking opens a contenteditable overlay; commit sends `replace` patch to `/props/<path>`.

## Quick controls → patches
| Control | Patch |
|---|---|
| Duration | replace `/duration` (clamped 1–30) |
| Energy | replace `/direction/...` through preset mapping (slow/normal/fast scales timing) |
| Colour role | replace `/props/colorRoles/<role>` |
| Swap skill/style/component | call engine re-direct with existing content |

## Persistence
DynamoDB tables for Project, Scene, SceneVersion (workspace-scoped keys). Repository layer in `apps/web/src/server/repo`.

## Onboarding
Wizard: goal → brand (spec 06) → prefilled prompt → generate. Goal sets default format, template suggestions and style suggestion.

## Performance
Player preview uses `useMemo` on scene; patch round trip through Haiku is the only network hop. Prefetch the catalog on studio load.

## Testing
- Hook tests for undo/redo/restore invariants (property: after N ops then N undos, state equals initial).
- Playwright smoke: prompt → chips → player visible → refine → export button enabled.
