# Requirements: Studio Editor

## Introduction
The main workspace where users prompt, preview, refine and export a scene. Simple mode only for MVP.

## Glossary
- **Plan chips**: editable chips showing component · skill · style · duration.
- **Studio**: the 3-column layout plus bottom prompt bar.

## Requirements

### R1: Layout
1. THE Studio SHALL show projects/storyboard on the left, canvas in the centre, inspector on the right, prompt/chat bar at the bottom.
2. THE app UI SHALL use a dark, calm theme consistent with the design system.

### R2: Prompt to scene
1. WHEN the user submits a prompt, THE Studio SHALL show plan chips and then the scene in the Player.
2. WHILE generation runs, THE Studio SHALL show progress states (planning, directing, validating).
3. THE chips SHALL be editable: changing one SHALL regenerate props with the new choice while keeping the user's content.
4. THE Studio SHALL offer "Why this direction?" displaying the skill's intent and the plan reasoning.
5. THE prompt box SHALL show placeholder examples based on the user's goal.

### R3: Refinement
1. WHEN the user types a chat instruction, THE Studio SHALL call refine and update the Player within 1.5s (p50).
2. THE inspector SHALL provide: duration, energy/speed slider, colour-role picker, swap component/style/skill.
3. THE canvas SHALL allow inline text editing; edits SHALL create a user-authored version.
4. IF a refine call fails, THEN THE Studio SHALL keep the previous scene and show a clear message.

### R4: Versions and undo
1. EACH AI or user change SHALL create a SceneVersion with `createdBy` and message.
2. THE Studio SHALL support undo/redo and restoring any earlier version.
3. THE Studio SHALL autosave; no change SHALL be lost on page reload.

### R5: Storyboard and projects
1. THE user SHALL create a project with default brand kit, style pack, format and pacing.
2. THE storyboard SHALL list scene cards with thumbnails and support drag reorder; order changes SHALL persist.
3. New scenes SHALL inherit the project defaults.

### R6: Templates and onboarding
1. THE Studio SHALL offer starter templates by goal (Show growth, Compare two things, Big number, Timeline of events, Where in the world, Announce a feature, Quote, Intro/outro).
2. Onboarding SHALL ask the user's goal, offer brand setup (spec 06) or skip, pre-fill an example prompt, and generate a first clip.
3. First clip SHALL appear in under 60 seconds from sign-up completion.

### R7: Export
THE Studio SHALL offer an Export action using spec 01 and a ready-to-use download link.

### R8: Keyboard
Space (play/pause), ⌘Z / ⌘⇧Z (undo/redo), ⌘S (save to library), ⌘E (export).

## Out of scope
Advanced mode (tracks, bezier, camera path), lock-element UI, variants, sequence preview, multi-select [V1/V2].
