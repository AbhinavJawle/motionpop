# Requirements: Component Library

## Introduction
Eight handcrafted Remotion components are the quality ceiling of the product. The AI only selects and configures them.

## Glossary
- **Component**: a Remotion React component with a Zod props schema.
- **Catalog**: machine-readable description of components given to the planning engine.
- **Direction hooks**: props through which a skill controls reveal order, holds, emphasis, camera targets and SFX cue points.

## Requirements

### R1: MVP component set
THE library SHALL provide: `number-reveal`, `bar-chart`, `line-chart`, `comparison-split`, `timeline`, `map-globe`, `kinetic-text`, `logo-sting` (names matching `ComponentTypeSchema`).

### R2: Component contract (applies to each)
1. Each component SHALL have a Zod props schema with defaults so `schema.parse({})`-plus-required-fields yields a renderable scene.
2. Each component SHALL take all colours, fonts, easing and durations from style tokens and SHALL NOT hardcode them.
3. Each component SHALL re-lay out (not crop) for every MVP format preset and respect that format's safe zones.
4. Each component SHALL apply a minimum text size per format.
5. Each component SHALL accept direction hooks: reveal mode, `holdAt`, emphasis target, camera keyframes, SFX cue points.
6. Each component SHALL render deterministically; randomness SHALL use a seeded generator.
7. Each component SHALL ship a preview story, property tests, and a catalog entry with an example prompt.

### R3: Behaviour per component
1. Number Reveal: count-up with prefix/suffix, optional delta and context line; final value displayed SHALL equal the input value.
2. Bar Chart: vertical or horizontal, highlight bar, annotation, sequential reveal.
3. Line Chart: draw-on line, highlighted segment, event markers, optional area fill.
4. Comparison Split: two sides, winner emphasis with visual weight shift.
5. Timeline: horizontal or vertical milestones, camera travels along it, ends on the last milestone.
6. Map/Globe: globe spin to a country, country highlight, route arcs, zoom to region (open-licence geo data only).
7. Kinetic Text: headline reveal with emphasis words and quote-card variant.
8. Logo Sting: brand intro/outro using brand-kit logo, with fallback to text wordmark if no logo.

### R4: Registry and catalog
1. THE registry SHALL map each `ComponentType` to its entry (spec 01).
2. THE catalog generator SHALL output id, description, JSON schema, example prompts and compatible skills for each component.
3. WHEN a component is added without a catalog entry, THE build SHALL fail.

### R5: Formatting
1. Numbers SHALL be formatted with `Intl.NumberFormat` for the scene's locale, supporting currency and compact notation (e.g. "B" vs "Mrd.").

## Out of scope
Pie/donut, stacked bars, scatter, ranking, process flow, device mockup, callouts, transitions pack [V1]; Sankey, 3D isometric [V2].
