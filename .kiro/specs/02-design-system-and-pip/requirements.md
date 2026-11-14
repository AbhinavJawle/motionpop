# Requirements: 02 design system and Pip

## Introduction
The shared UI kit that every screen is built from: exact Figma tokens, restyled primitives, the poppy motion language, and Pip built in code (SVG + `motion`) with every state animated. Includes a dev gallery to compare against the designs. Lands by **Wed Nov 18, 2026**.

## R1 Primitives match the design
**User story:** As a creator, I want every control to look and feel like the designs, so the app feels premium.
1. THE SYSTEM SHALL provide these components with the exact sizes, colours, radii, shadows and type from `design/figma-export.css`: Button (ember, ember-gradient, violet, outline, ghost, icon), Chip (cost-device, cost-cloud, status, scope, filter), Toggle, Input, Textarea, Card (glass, quiet), GlassToolbar, SegmentedPills (format switcher), CreditsChip, BrandKitChip, Avatar, Kbd, Tabs (underline), Slider, Dropdown, Modal, Toast, Tooltip, Skeleton/Shimmer, StatusDot.
2. THE SYSTEM SHALL use only design tokens (no raw hex values in components).
3. THE SYSTEM SHALL show a visible violet 2 px focus ring on every interactive element.

## R2 Poppy motion language
**User story:** As a creator, I want the UI to feel alive and fun without getting in my way.
1. THE SYSTEM SHALL provide shared motion presets (press, hover-lift, pop-in, panel-slide, modal, toast, number-roll, shimmer, breathe) built on `motion`.
2. WHEN a button is pressed THE SYSTEM SHALL scale it to 0.97 with a spring and restore it on release.
3. WHEN a number shown in a chip or stat changes THE SYSTEM SHALL roll it to the new value.
4. WHERE the user prefers reduced motion THE SYSTEM SHALL disable breathing, shimmer, floating and confetti and use instant state changes.

## R3 Pip
**User story:** As a creator, I want Pip to react to what's happening, so the app has personality.
1. THE SYSTEM SHALL render Pip as inline SVG matching the designs (body gradient, `#302D3D` face, wavy lobed bottom, ember rim light).
2. THE SYSTEM SHALL support the states idle, listening, thinking, done, celebrating, sleeping, waking, catching, caught, waving and empty-pockets, each with its animation from `pip-mascot.md`.
3. THE SYSTEM SHALL support the props nightcap, popcorn, cloud, sound arcs, sparkles, confetti, mic and pumpkin.
4. WHERE `look` is provided THE SYSTEM SHALL move Pip's eyes toward the cursor (−1..1) with a spring.
5. WHILE idle THE SYSTEM SHALL blink every 3–6 s and float ±4 px.
6. THE SYSTEM SHALL provide `PipAvatar` (face only) for the logo, avatar and rail.
7. THE SYSTEM SHALL never block pointer events unless Pip is interactive.

## R4 Dev gallery
1. THE SYSTEM SHALL provide `/dev/ui` (dev only) showing every primitive in every variant and Pip in every state and prop.
2. THE SYSTEM SHALL provide a 1440×900 Playwright screenshot of `/dev/ui` sections for visual review against `design/screens/*.png`.
