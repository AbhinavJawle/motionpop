# Requirements: Render & Export Pipeline

## Introduction
Turns a validated Scene JSON into a playable preview in the browser and an exported MP4. Built first so every later feature can be seen and exported.

## Glossary
- **SceneComposition**: the single Remotion composition that renders any Scene.
- **Render_Service**: server module that orchestrates Remotion Lambda renders.
- **RenderJob**: record of an export (status, progress, outputUrl).

## Requirements

### R1: Scene composition
**User Story:** As a user, I want any valid scene to render, so that I can preview and export it.
1. WHEN a valid Scene is passed, THE SceneComposition SHALL resolve the component from the registry and render it with the scene's props, style tokens and direction.
2. WHEN the Scene's component is not in the registry, THE SceneComposition SHALL render a visible error frame and report an error code `UNKNOWN_COMPONENT`.
3. THE SceneComposition SHALL derive width, height and fps from `FORMAT_CONFIGS[scene.format]` and duration frames from `scene.duration * fps`.
4. THE SceneComposition SHALL be deterministic: identical Scene input SHALL produce identical frames.

### R2: Browser preview
1. THE web app SHALL preview scenes with the Remotion Player without any server render.
2. WHEN the Scene JSON changes, THE Player SHALL show the updated frames within 1 second.
3. THE Player SHALL support play, pause, scrubbing and loop.

### R3: MP4 export
1. WHEN the user requests export, THE Render_Service SHALL create a RenderJob with status `pending` and start a Remotion Lambda render.
2. THE Render_Service SHALL output H.264 MP4, 1080p, 30fps in the scene's format dimensions.
3. WHILE a render is running, THE Render_Service SHALL expose progress as a number from 0 to 1.
4. WHEN a render completes, THE Render_Service SHALL store the file in S3 and return a signed CloudFront URL, setting status `completed`.
5. IF a render fails, THEN THE Render_Service SHALL set status `failed`, store a human-readable error, and allow retry.
6. THE exported filename SHALL follow `{order:02}_{slugified-title}.mp4`.
7. A 10-second 1080p scene SHALL export in under 60 seconds (p50).

### R4: Safety
1. THE Render_Service SHALL only render scenes that pass Zod validation.
2. THE Render_Service SHALL scope every RenderJob to a workspaceId and deny access to other workspaces.

## Out of scope
4K/60fps, alpha (ProRes 4444, WebM) [stretch], batch export, multi-format export, audio stems [V1].
