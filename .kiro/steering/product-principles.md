# Motionpop Product Principles

> These principles guide all development decisions for Motionpop.

## Core Principles

### 1. Scene-First
The unit of work is one scene/clip. Projects group scenes, but nothing forces a full-video workflow. Users should be able to create a single clip quickly without setting up an entire project structure.

### 2. AI Directs, It Doesn't Freestyle
**THE GOLDEN RULE**: The AI chooses components, styles and skills and outputs **validated JSON props**. It never writes raw animation code at runtime.

- All animation is in handcrafted Remotion components
- The AI only generates props that conform to Zod schemas
- Invalid props are caught by validation, not runtime errors
- This ensures quality is set by craft, not AI luck

### 3. Taste Over Quantity
Fewer, better components and skills. Every default must look premium.

- 6-8 components for MVP, not 50 mediocre ones
- Each component must pass the "premium" quality bar
- Director skills encode professional motion design taste
- Style packs must be visually coherent and distinctive

### 4. Edit, Don't Re-roll
Every change is targeted. Nothing unrelated changes.

- Chat refinement produces **JSON patches**, not full regenerations
- Lock elements to protect them from unintended changes
- Version history allows reverting to any previous state
- Users should feel in control, not playing dice

### 5. Time-to-Wow Under 60 Seconds
A new user's first clip must impress within one minute.

- Onboarding flow is streamlined (goal → brand → example prompt → generate)
- Example prompts are pre-filled and compelling
- First generation must be fast (target: <6 seconds)
- The initial result must look professional, not generic

### 6. Consistency by Default
Projects remember brand, style and pacing.

- Brand kit applies automatically to all scenes
- Style pack provides visual consistency
- Library references guide future generations
- "Match previous scene" carries pacing forward

### 7. Respect Real Workflows
Alpha exports, correct formats, frame-accurate timing, editor-friendly naming.

- Editors need transparent background clips (ProRes 4444, WebM alpha)
- Filenames should be descriptive (e.g., `03_revenue-chart.mov`)
- Formats respect platform safe zones (Shorts/Reels UI overlays)
- Timing must be frame-accurate for sync with voiceover

### 8. Transparent and Controllable
Skills are readable markdown. Users can see *why* a scene was directed a certain way.

- "Why this direction?" shows skill reasoning
- Skills are editable in plain markdown
- Advanced mode exposes all controls (easing, timing, camera keyframes)
- No black-box AI decisions that users can't inspect or override

### 9. Simple Surface, Deep Power
Business owners see goals and buttons. Pros can open advanced controls and edit skills.

- Two modes: Simple (default) and Advanced
- Simple mode: prompt, chips, quick controls
- Advanced mode: element tracks, easing curves, camera paths
- Progressive disclosure: complexity hidden until needed

### 10. Cheap to Run
Small JSON outputs, model routing, caching, so it stays affordable for users and for us.

- Target AI cost: €0.02–0.05 per scene
- Haiku for simple edits, Sonnet for planning, Opus only for retries
- Prompt caching for catalog (components, skills, styles)
- BYOK option lets users bring their own API key

## Quality Bar: "Definition of Premium"

Every component and scene must meet this standard:

- ✅ **Purposeful motion**: Nothing moves without a reason; motion guides the eye to the message
- ✅ **Clear hierarchy**: One hero element per moment
- ✅ **Readable holds**: Text holds long enough to read (~0.3s per word + 1s buffer)
- ✅ **Physical easing**: No linear motion, no cheap bounce unless intended
- ✅ **Consistent spacing**: Grid-based layout and type scale
- ✅ **Meaningful color**: Accent = emphasis, not decoration
- ✅ **Subtle sound**: Sound supports motion without overpowering
- ✅ **Format-intentional**: Looks designed for each format, not cropped or squeezed

## Anti-Patterns to Avoid

### ❌ Generic AI Look
- Same fades everywhere
- Constant, rhythmic motion
- No emphasis or visual weight
- Everything moves at the same speed

### ❌ Template Feel
- Obvious reuse of the same patterns
- Predictable reveal order
- No adaptation to content or message
- One-size-fits-all timing

### ❌ Over-Animation
- Motion for motion's sake
- Competing movements
- No holds or breathing room
- Viewer can't focus

### ❌ Uncontrolled AI
- Freestyle code generation
- Unpredictable prop values
- Different results for same input
- No way to precisely edit

### ❌ Broken Workflows
- Formats that require full re-generation
- Exports that don't match editor needs
- Lost work due to lack of versioning
- Inconsistent style across a project

## Development Guidelines

### When Adding a Component

1. **Start with the schema**: Define props in Zod with sensible defaults
2. **Design the variants**: How does it look in each style pack?
3. **Test responsiveness**: Does it reflow properly across formats?
4. **Implement skill hooks**: Which parameters should skills control?
5. **Write deterministic tests**: Same props → same frames
6. **Create catalog entry**: Example prompts and compatible skills

### When Creating a Skill

1. **Study reference**: Watch professional motion graphics in this style
2. **Write the intent**: What emotional or narrative goal does this serve?
3. **Define timing**: Break down the shot sequence as percentages
4. **Specify camera**: Static, drift, or push? How much?
5. **Set emphasis**: Which element, and how (color, scale, camera)?
6. **List anti-patterns**: What mistakes should be avoided?
7. **Test with components**: Does it work across different components?

### When Designing a Style Pack

1. **Define the mood**: What feeling should this evoke?
2. **Choose palette roles**: Not specific colors, but roles (background, accent, etc.)
3. **Select typography**: Display, body, and numerals must work together
4. **Craft easing curves**: Enter, exit, and emphasis should feel cohesive
5. **Set durations**: Fast-paced or contemplative?
6. **Design background**: Solid, gradient, texture, or grid?
7. **Test across components**: Every component should look premium in this pack

## AI System Guidelines

### Model Routing

- **Haiku**: Simple edits, tagging, naming, patch generation
- **Sonnet**: Intent parsing, planning, props generation
- **Opus**: Retries after 2 failures, "Pro quality" mode only

### Prompt Structure

1. **Intent extraction**: What is the user trying to show? What emotion?
2. **Component selection**: Which component best fits the content?
3. **Skill selection**: Which direction matches the intent?
4. **Style application**: Apply brand and style pack tokens
5. **Props generation**: Follow the skill to produce exact props
6. **Validation**: Check against schema and deterministic rules

### Cost Control

- Use prompt caching for static, large context (catalog)
- Output only JSON, never full code
- Patch-based refinement, not regeneration
- Model routing based on task complexity
- Per-user generation limits

### Quality Assurance

- **Schema validation**: All props validated with Zod
- **Deterministic checks**: Text overflow, element collisions, safe zones, data-number match
- **Visual checks**: Vision model reviews keyframes for clutter, contrast, composition
- **Safety checks**: Photosensitivity (flash thresholds), WCAG contrast

## User Experience Guidelines

### Prompt Design

- Smart placeholders based on user's goal
- Example prompts that demonstrate capabilities
- Conversational language, not technical jargon
- Clear about what data or assets are needed

### Plan Presentation

Show the plan as editable chips:
- **Component**: Bar Chart ▾
- **Skill**: Slow-Build Trend ▾
- **Style**: Money Documentary ▾
- **Duration**: 8s ▾

Users can change any chip before or after generation.

### Refinement UX

- Chat input for natural language edits
- Quick controls for common adjustments (speed, color, duration)
- Inline editing for text
- Advanced mode for precise control
- Lock icon to protect elements from changes

### Feedback & Learning

- 👍/👎 per scene with optional reason
- "Why this direction?" explanation with each generation
- Taste profile visible and editable in settings
- References show how they influenced a generation

## Success Metrics

### Activation
- Time to first generated scene (target: <60s)
- % of new users who export within first session

### Quality
- Edit-vs-regenerate ratio (more edits = better product)
- 👍 rate per scene
- Save-to-library rate

### Retention
- Week-1 / Week-4 retention
- Average scenes per project
- Free → paid conversion

### Cost
- AI + render cost per exported scene
- Gross margin (revenue per scene - cost per scene)

---

These principles are not suggestions—they are constraints that define what Motionpop is. Every feature and decision must align with them.
