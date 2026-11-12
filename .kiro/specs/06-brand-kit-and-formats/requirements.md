# Requirements: Brand Kit & Formats

## Introduction
Brand kits make every scene on-brand; format presets and auto-reframe make every scene fit its platform.

## Requirements

### R1: Brand kit creation
1. THE user SHALL upload a logo (PNG, SVG, JPG, WebP, max 5 MB).
2. WHEN a logo is uploaded, THE system SHALL extract a palette of up to 6 dominant colours and propose role assignments (primary, accent, background, text, muted).
3. THE user SHALL edit any colour and pick fonts from Google Fonts.
4. THE system SHALL preview the brand kit on sample scenes before saving.
5. THE user SHALL be able to skip brand setup; scenes SHALL then use the style pack defaults.

### R2: Applying the brand
1. WHEN a project has a brand kit, THE style resolver (spec 03) SHALL apply it to every scene.
2. THE contrast guard SHALL keep text at WCAG AA contrast or better and warn the user otherwise.
3. Logo Sting SHALL use the brand logo.

### R3: Security of uploads
THE system SHALL validate file type and size, store in S3 under the workspace prefix, and serve with signed URLs.

### R4: Format presets
1. THE system SHALL support `youtube-16x9`, `shorts-9x16`, `square-1x1`, `product-demo-16x9` with the dimensions and safe zones in `FORMAT_CONFIGS`.
2. WHEN the user switches format, THE scene SHALL re-lay out via the component's responsive layout, SHALL NOT crop, and SHALL keep content and timing.
3. THE canvas SHALL offer a safe-zone overlay toggle; for `shorts-9x16` the overlay SHALL show platform UI regions.
4. Text sizes SHALL scale per format and never drop below the format's minimum.

### R5: Product demo preset
`product-demo-16x9` SHALL support an optional loop mode that makes the last frame match the first.

## Out of scope
Website-URL extraction, multiple brand kits, logo sting styles, watermark/end card, brand rules, 4:5 and custom formats [V1/V2].
