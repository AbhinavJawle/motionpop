# Motionpop Quick Start Guide

> Get up and running in 5 minutes

## What You're Building

An AI-powered motion graphics studio where users describe a scene in plain words and get a cinematically directed, on-brand clip in seconds.

**The secret sauce**: Director skills (markdown files) that tell the AI *how* to direct, not just what to animate.

## Prerequisites

- Node.js 20+
- npm 10+
- AWS Account (for deployment)
- Anthropic API key or Amazon Bedrock access

## Installation

```bash
# Clone (if not already in the repo)
cd motionpop

# Install dependencies
npm install

# Copy environment file
cp apps/web/.env.example apps/web/.env.local

# Edit .env.local with your credentials
# You need at least:
# - ANTHROPIC_API_KEY or AWS credentials for Bedrock
# - AWS_REGION
```

## Start Development

```bash
# Build shared packages first
npm run build

# Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the landing page.

## Project Structure

```
motionpop/
├── apps/
│   └── web/                    # Next.js app
│       ├── src/app/            # Pages (App Router)
│       ├── src/components/     # React components
│       └── src/lib/            # Utilities
├── packages/
│   ├── components/             # Remotion scene components
│   ├── schemas/                # Zod schemas & types
│   ├── styles/                 # Style pack tokens (JSON)
│   ├── skills/                 # Director skills (Markdown)
│   ├── engine/                 # AI planning & validation
│   └── render/                 # Remotion Lambda rendering
└── .kiro/                      # Kiro configuration
    ├── steering/               # Development guides
    └── KIRO_LOG.md             # Development log
```

## Key Concepts

### Components
Handcrafted animated building blocks (bar chart, number reveal, etc.).
- Defined in `packages/schemas/src/components.ts`
- Implemented in `packages/components/`
- Have strict Zod schemas

### Style Packs
Visual languages that apply consistently:
- Editorial Explainer (light, newsy)
- Math Elegance (dark, precise)
- Money Documentary (dramatic, financial)

Files: `packages/styles/*.json`

### Director Skills
Markdown files that cinematically direct scenes:
- Shocking Stat Reveal (one number, maximum impact)
- Slow-Build Trend (gradual tension)
- Calm Explanation (teaching pace)

Files: `packages/skills/*.md`

## The Golden Rule

**AI outputs only validated JSON, never animation code.**

This is enforced throughout:
1. AI suggests component + skill + style
2. AI generates props (validated by Zod schema)
3. Handcrafted Remotion component renders the scene
4. Users refine with chat (AI returns JSON patches)

## MVP Checklist (Dec 3, 2026)

### Must-Have Features
- [ ] 6-8 handcrafted components
- [x] 3 style packs
- [x] 8 director skills (3 done, 5 to go)
- [ ] Prompt → AI planning → preview
- [ ] Chat-based refinement
- [ ] Brand kit (logo → palette extraction)
- [ ] Format presets (4 formats with auto-reframe)
- [ ] Save to library + references
- [ ] Export MP4 1080p
- [ ] Landing page (done ✅)

### Next Priorities
1. **Remotion components** - Start with Number Reveal
2. **AI engine** - Intent parsing + planning
3. **Studio UI** - Canvas + inspector + prompt input
4. **Export pipeline** - Remotion Lambda setup

## Development Workflow

### Adding a New Component

1. **Define schema** in `packages/schemas/src/components.ts`:
```typescript
export const MyComponentPropsSchema = BaseComponentPropsSchema.extend({
  title: z.string(),
  value: z.number(),
  // ... more props
});
```

2. **Create Remotion component** in `packages/components/`:
```typescript
import { AbsoluteFill } from 'remotion';
import { MyComponentProps } from '@motionpop/schemas';

export const MyComponent: React.FC<MyComponentProps> = ({ title, value }) => {
  return (
    <AbsoluteFill>
      {/* Your animation here */}
    </AbsoluteFill>
  );
};
```

3. **Add to registry** (coming soon)
4. **Write tests** (coming soon)
5. **Add catalog entry** with example prompts

### Creating a Director Skill

1. **Create markdown file** in `packages/skills/`:
```markdown
---
name: My Skill
id: my-skill
version: 1.0
use_when: When to use this skill
works_with: [component1, component2]
energy: medium
default_duration: 8s
---

## Intent
What this skill achieves

## Shot sequence (timing as % of duration)
1. 0-20%: What happens
2. 20-80%: What happens
3. 80-100%: What happens

## Camera
Camera instructions

## Emphasis
How to emphasize key elements

## Sound cues
When sounds should play

## Rules
- Must do this
- Never do that

## Anti-patterns
- ❌ Don't do this
- ❌ Avoid that
```

2. **Add to skill registry** (coming soon)
3. **Test with compatible components**

### Creating a Style Pack

1. **Create JSON file** in `packages/styles/`:
```json
{
  "id": "my-style",
  "name": "My Style",
  "description": "Description",
  "palette": {
    "background": "#...",
    "surface": "#...",
    "primary": "#...",
    "accent": "#...",
    "muted": "#...",
    "text": "#..."
  },
  "typography": {
    "display": "Font Name",
    "body": "Font Name",
    "numerals": "Font Name"
  },
  "easing": {
    "enter": [0.16, 1, 0.3, 1],
    "exit": [0.7, 0, 0.84, 0],
    "emphasis": [0.34, 1.2, 0.64, 1]
  },
  "durations": {
    "enter": 0.6,
    "exit": 0.4,
    "hold": 1.5
  },
  "background": {
    "type": "solid"
  },
  "camera": "static"
}
```

2. **Add to style registry** in `packages/styles/index.js`
3. **Test across all components**

## Testing Your Changes

```bash
# Type check
npm run type-check

# Lint
npm run lint

# Build
npm run build

# Run tests (when added)
npm run test
```

## Common Commands

```bash
# Install new dependency in web app
cd apps/web && npm install package-name

# Install new dependency in a package
cd packages/components && npm install package-name

# Clean build artifacts
rm -rf node_modules .turbo .next dist
npm install

# Update development log
code .kiro/KIRO_LOG.md
```

## Resources

- [Product Spec](./product-spec.md) - Full product vision
- [Development Guide](./DEVELOPMENT.md) - Detailed development docs
- [Product Principles](./.kiro/steering/product-principles.md) - Core principles
- [Technical Architecture](./.kiro/steering/technical-architecture.md) - System design
- [Kiro Log](./.kiro/KIRO_LOG.md) - Development progress

## Getting Help

- Check the product spec for "why" questions
- Check the technical architecture for "how" questions
- Check the development log for current status
- Review existing components/skills/styles for examples

## Demo Requirements

For Kiroween 2026 Hackathon (<3 min video):

1. **Problem**: Show generic AI motion (same everything, no story)
2. **Solution**: Same scene directed by Motionpop (wow moment)
3. **Features**: Style switch, brand kit, format switch, library save
4. **Real example**: Actual AI Impact video segment
5. **Tagline**: "AI can animate. It can't direct."

---

**Ready to build? Start with the Number Reveal component!**

Good luck and have fun! 🎬✨
