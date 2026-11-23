# Spec 35: Paper app screens (everything outside the editor)

Founder ask (2026-11-22): "completely redesign [the dashboard]. while you are at it redesign the onboarding and everything outside the editor."

Scope: `/dashboard`, `/sign-in`, `/start`, `/start/record`, `/start/script`, `/processing/[id]`, `/styles`, `/settings`, `/share/[id]`, `/terms`, `/privacy`. The editor (`/editor/[id]`) is out of scope and stays dark (spec 33).

## R1 One world from the site to the editor
- R1.1 THE SYSTEM SHALL draw every in-scope screen in the marketing site's language (spec 34): white paper, black ink, 2 px ink rules, hard ink shadows, Bebas Neue titles, Geist Mono body, Patrick Hand only for Pip's own notes, and Pip's crayon loops.
- R1.2 WHEN an in-scope screen is mounted THE SYSTEM SHALL switch the shared design tokens to their paper values, so shared parts (menus, modals, toasts, chips) and portals follow without forks.
- R1.3 WHEN the editor is open THE SYSTEM SHALL keep the dark studio tokens.

## R2 Dashboard
- R2.1 THE SYSTEM SHALL open with a time-aware greeting set as a poster title and the capture bar (hold to record, paste a script, drop audio, ⌘K) as the one bold frame on the page.
- R2.2 WHEN projects exist THE SYSTEM SHALL show the last opened project as the lead frame with Resume, a plain sentence of this week's numbers, and every project as a film frame with title, length, last edit, status and slot states, with search, sort and grid/list view.
- R2.3 WHEN there are no projects THE SYSTEM SHALL show an invitation to make the first one, and WHILE files are dragged over the page Pip catches them.
- R2.4 THE SYSTEM SHALL keep every existing behaviour: rename, duplicate, delete with confirm, damaged saves, the style strip, help and shortcuts.

## R3 Onboarding
- R3.1 Sign-in, Start (record / upload / script), Record, Script and Processing SHALL use the paper system and keep their current behaviour, accessible names and test ids.
- R3.2 Each screen SHALL have one memorable element (Start: three takes as storyboard panels; Record: the running clock; Processing: the steps as a shot list).

## R4 The rest
- R4.1 Styles, Settings, Share and the legal pages SHALL use the paper system and keep their behaviour.

## R5 Quality
- R5.1 Typecheck, lint and unit tests stay green; touched e2e checks are updated to the new layout.
- R5.2 Screens are checked by screenshot at 1440 wide; keyboard focus is visible; reduced motion shows Pip's still.
