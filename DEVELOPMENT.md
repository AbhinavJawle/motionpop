# Motionpop Development Guide

## Project Overview

Motionpop is an AI-powered motion graphics studio built for the Kiroween 2026 Hackathon. The project demonstrates the "Frankenstein" category by combining:

1. **LLM direction** (Claude for scene planning and refinement)
2. **Handcrafted deterministic animation** (Remotion components)
3. **Brand/style systems** (style packs and brand kits)
4. **Cloud rendering** (Remotion Lambda)

## Architecture

### Monorepo Structure

```
motionpop/
├── apps/
│   └── web/                 # Next.js 15 application
├── packages/
│   ├── components/          # Remotion scene components
│   ├── schemas/             # Zod schemas & TypeScript types
│   ├── styles/              # Style pack token files
│   ├── skills/              # Director skill markdown files
│   ├── engine/              # AI planning & validation engine
│   └── render/              # Remotion Lambda orchestration
└── infra/                   # AWS CDK infrastructure
```

### Tech Stack

- **Frontend**: Next.js 15, React 19, TypeScript, Tailwind CSS, shadcn/ui, Framer Motion
- **Animation**: Remotion (components, player, Lambda rendering)
- **AI**: Amazon Bedrock (Claude Sonnet/Opus), Anthropic API (BYOK)
- **Cloud**: AWS (S3, CloudFront, Lambda, Cognito, DynamoDB, Transcribe)
- **Build**: Turborepo for monorepo management
- **Validation**: Zod for runtime type safety
- **Payments**: Stripe

## Core Concepts

### The Golden Rule

**The runtime AI outputs only validated JSON** (component choice + props + skill application + camera keyframes). It never writes animation code. All animation is executed by handcrafted components.

### Components

Handcrafted animated building blocks with strict props schemas:
- Number Reveal
- Bar Chart
- Line Chart
- Comparison Split
- Timeline
- Map/Globe
- Kinetic Text
- Logo Sting

Each component:
- Has a Zod props schema
- Supports all style packs
- Is responsive across formats
- Has deterministic rendering

### Style Packs

Visual languages applied consistently:
- **Editorial Explainer**: Clean, bold, newsy
- **Math Elegance**: Dark, precise, calm
- **Money Documentary**: Dramatic, financial

Each pack defines:
- Color palette roles
- Typography (display, body, numerals)
- Easing curves (enter, exit, emphasis)
- Durations
- Background treatment
- Camera behavior defaults

### Director Skills

Markdown files that cinematically direct scenes:
- **Shocking Stat Reveal**: Make one number unforgettable
- **Slow-Build Trend**: Build tension gradually
- **Calm Explanation**: Clear teaching pace
- **And 5 more for MVP**

Skills specify:
- Shot sequence and timing
- Camera movement
- Emphasis strategy
- Sound cues
- Rules and anti-patterns

## MVP Feature Checklist (Dec 3, 2026)

### Components (6-8 handcrafted)
- [ ] Number Reveal
- [ ] Bar Chart
- [ ] Line Chart
- [ ] Comparison Split
- [ ] Timeline
- [ ] Map/Globe
- [ ] Kinetic Text
- [ ] Logo Sting

### Style Packs (3)
- [x] Editorial Explainer
- [x] Math Elegance
- [x] Money Documentary

### Director Skills (8)
- [x] Shocking Stat Reveal
- [x] Slow-Build Trend
- [x] Calm Explanation
- [ ] Contrast Split
- [ ] Journey Timeline
- [ ] Zoom World to Place
- [ ] Countdown Ranking
- [ ] Brand Sting

### Core Features
- [ ] Prompt box with smart placeholders
- [ ] AI planning (component + skill + style suggestion)
- [ ] "Here's my plan" chips (editable before generation)
- [ ] Live preview with Remotion Player
- [ ] Chat-based refinement
- [ ] Inline text editing
- [ ] Quick controls (duration, speed, color, swap)
- [ ] Undo/redo + version history
- [ ] Brand kit (logo upload → palette extraction)
- [ ] Format presets (YouTube 16:9, Shorts 9:16, Square 1:1, Product demo)
- [ ] Auto-reframe across formats
- [ ] Save to library + "use as reference"
- [ ] Library browser (search, tags, filters)
- [ ] Deterministic quality checks
- [ ] Export MP4 1080p (stretch: WebM alpha)
- [ ] BYOK field (Anthropic API key)
- [ ] Landing page

### AI Pipeline
- [ ] Intent parsing (Sonnet)
- [ ] Planning with catalog (Sonnet + prompt caching)
- [ ] Props generation with skill application (Sonnet)
- [ ] Validation (Zod + deterministic checks)
- [ ] Refinement patches (Haiku)
- [ ] Model routing & cost control

## Getting Started

### Prerequisites

- Node.js 20+
- npm 10+
- AWS Account (for deployment)
- Anthropic API key or Amazon Bedrock access

### Installation

```bash
# Install dependencies
npm install

# Set up environment variables
cp apps/web/.env.example apps/web/.env.local
# Edit .env.local with your credentials

# Build shared packages
npm run build

# Start development server
npm run dev
```

The app will be available at `http://localhost:3000`.

### Development Workflow

1. **Adding a new component**:
   - Create schema in `packages/schemas/src/components.ts`
   - Build Remotion component in `packages/components/`
   - Add to component registry
   - Write tests and stories

2. **Adding a new skill**:
   - Create markdown file in `packages/skills/`
   - Follow the skill anatomy format
   - Add to skill registry
   - Test with compatible components

3. **Adding a new style pack**:
   - Create JSON file in `packages/styles/`
   - Define all required tokens
   - Add to style registry
   - Test across all components

## Quality Standards

### Component Contract Checklist

Every component must:
- ✅ Have a Zod props schema with sensible defaults
- ✅ Support all style-pack tokens (no hardcoded colors/fonts)
- ✅ Be responsive across all format presets (re-layout, not crop)
- ✅ Respect safe zones and minimum text sizes per format
- ✅ Expose skill hooks (reveal order, holds, emphasis targets, camera targets, SFX cue points)
- ✅ Render deterministically (same props → same frames)
- ✅ Include a preview story, property tests, and a catalog entry with an example prompt

### Definition of "Premium"

- Nothing moves without a reason; motion guides the eye to the message
- Clear hierarchy: one hero element per moment
- Holds long enough to read (~0.3s per word + 1s)
- Easing feels physical (no linear motion, no cheap bounce unless intended)
- Consistent spacing grid and type scale
- Color used for meaning (accent = emphasis), not decoration
- Sound supports motion subtly
- Looks intentional in every format, not cropped or squeezed

## Kiro Development Setup

This project uses Kiro AI IDE for development. The `.kiro/` directory contains:

### Steering Files
Documentation and standards that guide AI development:
- Product specification
- Technical architecture
- Component standards
- Skill format
- Design system

### Hooks
Automation that runs on specific events (coming soon):
1. **New-component scaffolder**: Creates schema + registry + test + story + catalog entry
2. **Component quality check**: Schema validation + property tests + test-frame render + overlap/safe-zone checks
3. **Skill validator**: Validates markdown structure on save
4. **Task-complete checks**: Runs typecheck + tests
5. **Docs/catalog sync**: Keeps documentation up to date

### MCP Servers
Context providers for development (coming soon):
- Remotion documentation
- AWS documentation
- Component catalog

## Demo Plan

For the hackathon demo video (<3 min):

1. **Problem**: Show generic AI motion (same fades, same timing, no story)
2. **Solution**: Same scene with Motionpop director skill (wow moment)
3. **Show features**:
   - Style pack switch (Editorial → Money Documentary)
   - Brand kit application
   - Format switch (16:9 → Reels 9:16, auto-reframe)
   - Save to library
4. **Real example**: Cut together actual AI Impact video segment
5. **Tagline**: "AI can animate. It can't direct."

## Submission Checklist

- [ ] Public GitHub repo with OSI license
- [ ] `/.kiro` directory at repository root
- [ ] Working URL + test login credentials
- [ ] YouTube demo video (<3 min)
- [ ] LinkedIn profile + startup website (for Best Startup category)
- [ ] Credits requested before Dec 1, 21:00 CET
- [ ] Final submission by Dec 3, 2026

## Risks & Mitigation

| Risk | Mitigation |
|------|------------|
| Crowded market | Lead with director skills + library + editor-first exports |
| Generic output | Focus on component craft and skill quality; test with real creators |
| Remotion complexity | Build export pipeline first; test early |
| AI cost spikes | Model routing, caching, BYOK, per-user limits |
| Scope creep (3 weeks) | Strict MVP list; anything not in demo waits |

## Resources

- [Product Spec](./product-spec.md)
- [Remotion Documentation](https://remotion.dev)
- [Amazon Bedrock](https://aws.amazon.com/bedrock)
- [Anthropic Claude](https://www.anthropic.com/claude)
- [shadcn/ui](https://ui.shadcn.com)

## License

See [LICENSE](./LICENSE) file.

---

Built with ❤️ using Kiro AI IDE for Kiroween 2026.
