# KIRO_CONTEXT.md: Project Briefing for Claude in Kiro

> **Read this first.** This document gives you (Claude, working inside Kiro) the full context of what we are building, why, under which constraints, and how we want you to work. Read it together with **`docs/product-spec.md`** (the full product specification). If anything in this file conflicts with `product-spec.md`, **this file wins for process and scope decisions**, and `product-spec.md` wins for product details.
>
> When you're unsure, **ask before deviating** from decisions recorded here.

---

## 0. TL;DR
- I'm a 1-person team building **Motionpop** *(working name)*, an AI motion-graphics SaaS whose USP is **director skills**: markdown files that cinematically direct each scene so the output looks professionally directed, not generic.
- I'm building it for the **Kiroween 2026** hackathon (AWS / Kiro, Devpost). **Hard deadline: December 4, 2026, 2:00 PM PT (23:00 German time). Our internal deadline is December 3.** The clock is already running.
- **Kiro is our development environment.** How well we use Kiro (specs, steering, hooks, MCP, property tests) is one of five equally weighted judging criteria, so we use it deliberately and visibly.
- **Golden rule of the product:** at runtime, the AI **never writes animation code**. It only outputs **validated JSON** that configures **handcrafted Remotion components**.
- Scope is brutal: **Phase 0 MVP only** (see Section 6). Polish beats feature count.
- Order of work: **steering files**, then the **specs in order** (Section 8), starting with the **render pipeline**.

---

## 1. Who we are
- **Abhinav** (solo): 20, dual-study computer science student in Germany, working alongside study. Self-taught in TypeScript/JavaScript, Python, Java; comfortable with Next.js. Runs a YouTube channel, **The AI Impact** (finance + AI + tech explainers in a *How Money Works*-like style). **He is the product's first user.** He cares a lot about design and motion quality.
- Abhinav owns everything: steering, design system, scene components, style packs, director skills, render/export pipeline, AI planning engine, data validation, AWS infrastructure, library/persistence, UI polish and the demo video. Claude in Kiro is the pair programmer.
- Time budget: evenings and weekends, about 3 weeks. **Assume about 60–80 focused hours in total.** Plan accordingly.

---

## 2. What we're building (short version)
A web app where a user **describes one scene** ("Nvidia revenue 2020–2025, bar chart, make the 2024 jump feel shocking"), and the app:
1. Interprets intent and proposes a plan: **component** (e.g. bar chart) · **director skill** (e.g. "Slow-Build Trend") · **style pack** (e.g. "Money Documentary") · **duration**.
2. Generates a **directed, polished, on-brand clip** shown instantly in a live preview (Remotion Player).
3. Lets the user **refine** it by chat ("hold 2024 longer") or by direct controls, **without re-rolling** everything.
4. Lets the user **save it to their library** (optionally as a **reference** for future scenes).
5. **Exports** it in the right format (YouTube 16:9, Reels 9:16, square, product demo).

**Scene-first, not script-first.** Creators build videos in Premiere/DaVinci and need individual clips. We do not build a "whole script → whole video" pipeline.

Full details: `docs/product-spec.md`.

---

## 3. Why these decisions were made (decision log)
Respect these unless we explicitly change them.

| # | Decision | Why |
|---|---|---|
| D1 | **USP = director skills** (markdown that cinematically directs scenes) | Generic AI motion looks generic because nothing *directs* it. Skills encode taste. That's our differentiation in a crowded market (Hera, Higgsfield Vibe Motion, Jitter, Adobe AI). |
| D2 | **AI outputs JSON only; handcrafted components do the animation** | Quality ceiling set by craft, not AI luck. Deterministic, testable, cheap (small outputs), consistent. |
| D3 | **Scene-first workflow** | Matches how creators and editors actually work (clips into an NLE). Simpler to build well. |
| D4 | **Style packs + brand kit** | Consistency and personalisation are top pains with AI tools. |
| D5 | **Personal library with references** | The product gets better the more you use it, and builds stickiness. |
| D6 | **Remotion** (React-based video) | Code-based, deterministic, live preview via Player, cloud rendering via Lambda. |
| D7 | **Heavy AWS usage** | The hackathon is by AWS. Bedrock, S3, CloudFront, Cognito, DynamoDB, Lambda, Transcribe, Amplify. |
| D8 | **Cheap model routing + BYOK** | Sonnet-class for planning, Haiku-class for edits, Opus-class only for retries. Users can bring their own Anthropic API key. |
| D9 | **Category: Frankenstein** | We stitch LLM direction + deterministic animation + brand/style systems + cloud rendering into one product. |
| D10 | **No brand names in style presets** | Styles are named descriptively ("Editorial Explainer", "Math Elegance", "Money Documentary"), never "Vox style" or "3Blue1Brown style". No copied logos, fonts or characters. |
| D11 | **Numbers are verified in code, not by AI** | Data correctness must be deterministic. Vision models only judge *appearance*. |
| D12 | **Kiro is dev-only** | Kiro is not part of the runtime product. It's how we build. |
| D13 | **Toolchain (Nov 12, 2026):** Node 24 LTS (pnpm 11 needs ≥22.13), pnpm 11, Turborepo 2, TypeScript 6.0 (not 7: typescript-eslint supports <6.1), ESLint 9.39 (not 10: Next's lint plugins support ≤9), Next 16, React 19, Remotion 4, zod 4, Tailwind 4, Vitest 5, fast-check 4 | Latest stable versions that work together. Recorded in `.kiro/steering/tech.md`. |

---

## 4. The hackathon: rules and judging (what we optimise for)

### 4.1 Requirements
- Build a **new, working app** using Kiro during the submission period (it opened Oct 30, 2026).
- **Public GitHub repo** with an **OSI open-source licence** and the **`/.kiro` directory at the repo root** (never gitignore it).
- A **functional app URL** plus testing instructions (test login if needed).
- A **demo video under 3 minutes**, public on YouTube.
- A **written explanation of how Kiro was used.** Judges must understand how effectively we used Kiro.
- Best Startup Project bonus: founder declaration, LinkedIn, startup website.
- Kiro credit request deadline: **Dec 1, 2026, 12:00 PM PT** (21:00 German time).

### 4.2 Judging criteria (equal weight)
1. **Potential Impact:** real problem, real audience, would someone actually use this?
2. **Technological Implementation:** how thoroughly and skilfully we used **Kiro**; a thoughtful AI-development strategy; a variety of Kiro tools used impactfully; experimentation.
3. **Design:** a complete, coherent, polished product experience, not a proof of concept.
4. **Innovation / Idea:** novel concept, different from existing tools; unusual technologies or public resources combined uniquely.
5. **Presentation:** clear end-to-end demo video; problem, audience and why it matters; memorable.

### 4.3 What this means for how you work
- **Make Kiro usage visible and meaningful.** Specs for every feature, steering that genuinely guides you, hooks that automate real work, Bugfix specs for real bugs, property-based tests. Kiro judges reward "why didn't I think of that?" automations, not checkbox usage.
- **Don't overclaim.** Everything in our write-up must exist in the repo.
- **Polish matters more than breadth.** A narrow, flawless product beats a broad, buggy one.

### 4.4 Prizes we target
Overall (1st $30k / 2nd $20k / 3rd $10k) **or** Best Frankenstein ($5k), plus bonus prizes: **Best Startup Project ($10k)**, Best Demo ($1k), Best Student Project ($1.5k, solo student entry), Best Kiro Crew App ($1k, optional, only if time allows).

---

## 5. Working agreements: how you (Claude in Kiro) should work
1. **Spec-driven by default.** Every feature gets a spec: `requirements.md` (EARS format) → `design.md` → `tasks.md`. Draft, wait for review, then implement task by task.
2. **Use vibe mode only for small things:** visual tweaks, copy changes, quick fixes.
3. **Follow steering files strictly.** If steering seems wrong, say so and propose an edit. Don't silently ignore it.
4. **Small, reviewable steps.** One task at a time; run tests after each. Never make sweeping refactors without asking.
5. **Never break the golden rule** (runtime AI → JSON only).
6. **No secrets in code or commits.** Use `.env` (and `.env.example` with placeholders). Ensure `.env*` is in `.gitignore` and `.kiroignore`.
7. **Prefer boring, proven solutions** over clever ones, except in animation craft.
8. **Every component must meet the component contract** (Section 10.3).
9. **When a bug appears, create a Bugfix spec** (don't just patch silently) for anything non-trivial.
10. **Keep `KIRO_LOG.md` updated:** after each meaningful step, add a short entry (date, what Kiro feature was used, what it achieved, and a screenshot path if relevant). This feeds our Devpost write-up and blog post.
11. **Ask, don't assume** when product intent is unclear. Offer two or three options with a recommendation.
12. **Model/credit strategy:** heavy reasoning (architecture, planning engine, hard bugs) can use Opus 5.5; routine implementation uses Sonnet 5.5 or Auto; trivial edits use Haiku 5.5. Avoid regenerating whole files when a small diff suffices.
13. **Write code a human can maintain:** clear names, small modules, comments only where intent isn't obvious.

---

## 6. Scope: Phase 0 MVP (build only this before Dec 3)

### Must have (demo-critical)
- [ ] **Render pipeline:** Remotion component → live preview (Remotion Player) → **MP4 export 1080p** (start local, then Remotion Lambda → S3 → CloudFront).
- [ ] **Component library (6–8, beautifully crafted):** Number Reveal, Bar Chart, Line Chart, Comparison Split, Timeline, Map/Globe, Kinetic Text, Logo/Title Sting. *If time is short, cut to 5–6 and make them perfect.*
- [ ] **3 style packs:** Editorial Explainer, Math Elegance, Money Documentary.
- [ ] **8 director skills** (see `product-spec.md` §8.3) in the standard skill format.
- [ ] **Planning engine:** prompt → intent → plan (component · skill · style · duration) → props JSON → zod validation → auto-retry on failure (max 2) → safe fallback.
- [ ] **"Here's my plan" chips:** editable before and after generating.
- [ ] **Refine:** chat → JSON patch (fast model) → validated → preview updates; inline text editing; quick controls (duration, energy, colour role, swap component/style/skill).
- [ ] **Version history** per scene (undo/redo + restore).
- [ ] **Brand kit (basic):** logo upload → palette extraction → font choice → applied via style-pack palette roles.
- [ ] **Formats:** YouTube 16:9, Reels 9:16 (with safe-zone overlay), Square 1:1, Product demo 16:9; **auto-reframe** (responsive components, not cropping).
- [ ] **Library (basic):** "Save to library" after a generation, tags, "use as reference" flag, library browser.
- [ ] **Deterministic quality checks:** text overflow, minimum font size per format, element collisions, safe zones, displayed numbers match input data.
- [ ] **Auth (Cognito)**, **BYOK field** (Anthropic key, encrypted, deletable), **AWS Budgets alerts**.
- [ ] **Landing page** on the product domain.
- [ ] **Demo content:** 4–6 scenes for one real segment of an AI Impact video.

### Nice to have (only if Must-haves are done and polished)
- [ ] Transparent-background export (WebM alpha)
- [ ] Visual QA on keyframes (vision model)
- [ ] Simple SFX on key motion moments
- [ ] Sequence preview (play scenes back to back)
- [ ] Skill editor with live preview

### Explicitly out of scope until after the hackathon
Script → whole video pipeline, talk-back/interactive video, marketplace, team collaboration, review links, live data connectors, Figma import, public API, code export, music beat sync, 4K/60fps, ProRes, multi-language UI, mobile app, Stripe billing (a pricing page with a waitlist is fine).

---

## 7. Technical architecture (target)

### 7.1 Stack
- **Monorepo:** pnpm workspaces + Turborepo.
- **Web app:** Next.js (App Router), React, TypeScript (strict), Tailwind, shadcn/ui, Framer Motion (UI only).
- **Animation:** Remotion (components), `@remotion/player` (preview), `@remotion/lambda` (cloud render).
- **Validation:** zod (one schema per component, shared types).
- **AI:** provider abstraction (e.g. Vercel AI SDK) supporting **Amazon Bedrock** (Claude) and the **Anthropic API** (for BYOK). Prompt caching for the static catalog (components, schemas, skills, style tokens).
- **AWS:** Bedrock, S3, CloudFront, Cognito, DynamoDB, Lambda (Remotion Lambda), Amplify Hosting (or CloudFront + Lambda), KMS (BYOK key encryption), Transcribe (later, for voiceover sync), AWS Budgets.
- **IaC:** AWS CDK or SST (pick one early; record it in `tech.md`).
- **Testing:** Vitest, fast-check (property-based), Playwright (a few e2e smoke tests), Remotion still renders for visual checks.

### 7.2 Repo layout
```
/apps/web                 Next.js app (UI, API routes)
/packages/components      Remotion scene components + stories + tests
/packages/schemas         zod schemas, shared TS types
/packages/styles          style pack token files (JSON/TS)
/packages/skills          built-in director skills (.md)
/packages/engine          planning, validation, patching, model routing
/packages/render          render orchestration (local + Lambda)
/packages/checks          deterministic quality checks
/infra                    IaC
/.kiro                    steering, specs, hooks (dev only)
KIRO_LOG.md               our Kiro usage log (for the write-up)
```

### 7.3 Runtime AI pipeline
1. **Intent parse** (Sonnet-class): prompt + data → `{ message, entities, data, emotion }`
2. **Plan** (Sonnet-class + cached catalog): choose component, skill and style, respecting project defaults and library references
3. **Props** (Sonnet-class; Opus-class only on retry/"pro quality"): apply the skill → full props + direction (camera, reveal, holds, SFX cues)
4. **Validate:** zod + deterministic checks → on failure feed errors back (≤2 retries) → fallback defaults
5. **Preview:** Remotion Player (client-side, instant)
6. **Refine** (Haiku-class): JSON patch → validate → preview
7. **Export:** Remotion Lambda → S3 → CloudFront signed URL

Target AI cost: a few cents per scene. Never regenerate a whole scene for a small edit.

### 7.4 Performance targets
- Plan + first preview: < 6s (p50)
- Edit → preview update: < 1.5s (p50)
- 10s 1080p export: < 60s

---

## 8. Kiro plan (what to create, in order)

### 8.1 Steering files (`.kiro/steering/`), create first
| File | Content |
|---|---|
| `product.md` | What the product is, who it's for, USP (director skills), scene-first, principles, MVP scope. Short and sharp. |
| `tech.md` | Stack, versions, **golden rule (runtime AI → JSON only)**, provider abstraction, AWS services, IaC choice, testing tools, coding conventions. |
| `structure.md` | Monorepo layout, naming conventions, where things go, import rules between packages. |
| `design-system.md` | App UI design language (dark, calm, premium), spacing scale, typography, motion rules for UI. |
| `motion-principles.md` | The "premium" quality bar for animation: hierarchy, holds (~0.3s/word + 1s), easing rules (no linear, no unintended bounce), one hero per moment, accent = emphasis, safe zones, readable sizes per format. |
| `component-contract.md` | The rules every scene component must follow (Section 10.3). |
| `skill-format.md` | The standard director-skill markdown format (front matter + sections), validation rules. |
| `style-pack-format.md` | Token schema for style packs, palette roles, how brand kits map onto roles. |
| `security-and-cost.md` | No secrets in code, BYOK handling (KMS, never log keys), rate limits, model routing rules, budget alerts. |
| `kiro-log.md` | Instruction to append to `KIRO_LOG.md` after meaningful steps. |

Keep steering concise and actionable. Steering is read constantly, so bloat wastes credits.

### 8.2 Specs (`.kiro/specs/<feature>/`), in this order
1. **`render-pipeline`:** one component (Number Reveal), zod schema, Player preview, local MP4 export, then Lambda export. *Proves the riskiest part first.*
2. **`style-system`:** style pack tokens, palette roles, brand-kit mapping, 3 packs.
3. **`component-library`:** remaining components following the contract; responsive across formats.
4. **`director-skills`:** skill format, parser/validator, 8 built-in skills, skill → props application.
5. **`planning-engine`:** intent → plan → props → validation → retries → fallback; model routing; provider abstraction; BYOK.
6. **`scene-editor`:** UI layout, plan chips, chat refine (JSON patch), inline edit, quick controls, version history, format switcher + safe zones.
7. **`library`:** save, tags, references, browser; reference-aware planning.
8. **`brand-kit`:** logo upload, palette extraction, fonts, application.
9. **`quality-checks`:** deterministic checks package + UI warnings.
10. **`auth-and-infra`:** Cognito, DynamoDB tables, S3/CloudFront, Amplify deploy, budgets.
11. **`landing-page`:** marketing site on the product domain.

Create **Bugfix specs** (`.kiro/specs/bugfix-<name>/`) for non-trivial bugs.

### 8.3 Hooks (`.kiro/hooks/`)
1. **New component scaffolder:** *when* a new folder/file is created in `packages/components/src/scenes/` → generate the zod schema stub, register it in the component registry, create a preview story, a property-test file and a catalog entry with an example prompt. *(Our "why didn't I think of that" hook.)*
2. **Component quality check:** *when* a scene component or its schema is saved → run schema tests + property tests + render a test still per format + run deterministic checks (overflow, collisions, safe zones). Report failures; suggest a Bugfix spec if needed.
3. **Skill validator:** *when* a `.md` in `packages/skills/` is saved → validate front matter and sections, check referenced components exist, check timing sums are sane.
4. **Style pack validator:** *when* a style pack file is saved → validate tokens against the schema, check text/background contrast (WCAG AA).
5. **Task completion check:** *when* a spec task completes → typecheck + run affected tests.
6. **Docs/catalog sync:** *when* components, skills or styles change → update `docs/catalog.md` and the README feature list.
7. *(Optional, week 3)* **Kiro log reminder:** after a spec completes → prompt to add a `KIRO_LOG.md` entry.

Mirror every hook's checks as **npm scripts** (`pnpm check:components`, etc.) so they also run in CI. Note: Kiro file hooks fire only on agent edits, so the scripts plus CI are what guarantee the checks run on manual edits too.

### 8.4 MCP
- A **docs MCP** (e.g. Context7) for up-to-date Remotion, Next.js and AWS SDK docs.
- **AWS docs/knowledge MCP** if available.
- *(Optional)* A small **internal catalog MCP** that exposes our component/skill/style catalog to Kiro during development.

### 8.5 Property-based tests (fast-check)
- Durations: all timed elements fit inside the scene duration.
- Schemas: any valid generated props render without throwing.
- Data match: rendered labels/numbers equal the input data (formatting-aware).
- Layout: text never exceeds its container for random content lengths within limits.
- Skills: timing percentages are monotonic and within 0–100%.

---

## 9. Timeline (Nov 12 → Dec 3, 2026)

| Dates | Goal | Exit criteria |
|---|---|---|
| **Nov 12–13** | Repo, licence, `.kiro` steering, spec #1 render pipeline | Number Reveal previews in the browser and **exports an MP4** |
| **Nov 14–17** | Style system + 3 packs; first 3–4 components | Same scene switches between 3 styles cleanly |
| **Nov 18–21** | Remaining components; director skills format + 8 skills | Each component directed by at least one skill |
| **Nov 22–24** | Planning engine (prompt → validated props), model routing, BYOK | Prompt → directed scene end to end |
| **Nov 25–27** | Scene editor (chips, chat refine, quick controls, versions), formats + safe zones | Full create → refine loop feels snappy |
| **Nov 28–29** | Library, brand kit, quality checks, auth, deploy to AWS | Working public URL with login |
| **Nov 30–Dec 1** | Polish, landing page, **request Kiro credits (by Dec 1, 21:00 German time)** | Looks and feels premium |
| **Dec 2** | Demo video (made with the product), README, Devpost write-up, `KIRO_LOG.md` cleanup | Video < 3 min uploaded |
| **Dec 3** | Final checks, **submit** | Submission complete |

If we fall behind: cut components (keep quality), cut nice-to-haves, never cut the render pipeline, the skills or the demo.

---

## 10. Quality bars

### 10.1 Product "premium" bar
- Nothing moves without a reason; motion guides the eye to the message.
- One hero element per moment; clear hierarchy.
- Holds long enough to read (~0.3s per word + 1s).
- Physical easing (no linear; bounce only when intended).
- Accent colour = emphasis, not decoration.
- Looks intentional in every format (re-layout, not crop).

### 10.2 Code bar
- TypeScript strict, no `any` without justification.
- Pure functions for planning/validation logic; side effects at the edges.
- Each package has tests; CI runs typecheck + tests + checks.
- No dead code, no commented-out blocks in commits.

### 10.3 Component contract (every scene component must…)
- Export a **zod props schema** with sensible defaults.
- Use **only style-pack tokens** (no hardcoded colours or fonts).
- Be **responsive** across all format presets.
- Respect **safe zones** and **minimum text sizes** per format.
- Expose **skill hooks:** reveal order, hold points, emphasis targets, camera targets, SFX cue points.
- Render **deterministically** (same props → same frames).
- Include a **preview story**, **property tests** and a **catalog entry** (description + example prompt + example props).

---

## 11. Submission checklist (Dec 3)
- [ ] Public repo with an OSI licence; `/.kiro` at the root with steering, specs (incl. at least one Bugfix spec) and hooks
- [ ] README: what it is, screenshots/GIF, setup, architecture diagram, **how Kiro was used** (with links to specific specs/hooks), AWS services used, BYOK note
- [ ] Working app URL + test credentials
- [ ] Demo video < 3 min on YouTube: problem → generic vs directed scene → style switch → brand kit → format switch → library → real AI Impact segment → tagline
- [ ] Devpost write-up: problem, insight, what it does, how we built it, **Kiro section** (specs, steering, hooks, MCP, property tests, and our hybrid strategy if any), challenges, accomplishments, what we learned, what's next, judges' TL;DR
- [ ] Category: **Frankenstein**; bonus: **Best Startup** (founder declaration, LinkedIn, startup website), Best Demo; Best Student if eligible
- [ ] Kiro credits requested (by Dec 1)
- [ ] Every claim in the write-up exists in the repo

---

## 12. Guardrails (never do these)
- Never let runtime AI generate or execute arbitrary code.
- Never commit secrets or real API keys; never log BYOK keys.
- Never use other creators' brand names, logos, fonts or characters in presets or assets.
- Never use assets (fonts, icons, SFX, map data) without a compatible licence. Track licences in `LICENSES-ASSETS.md`.
- Never claim a feature in docs or the video that doesn't work.
- Never expand scope without updating this file and getting agreement.

---

## 13. Open decisions (ask Abhinav when relevant)
1. Final product name and domain (candidates: Motionpop, Muybridge Motion, Persistence Motion).
2. IaC: AWS CDK vs SST.
3. Hosting: Amplify Hosting vs CloudFront + Lambda.
4. Globe/map rendering approach (SVG/D3 geo vs three.js/WebGL inside Remotion).
5. Which open-licence fonts and icon set to standardise on.
6. Whether to attempt alpha export and SFX before Dec 3.

*Resolved:* team size (solo), toolchain versions (D13).

---

## 14. First actions
1. Read `docs/product-spec.md` fully.
2. Create the **steering files** from Section 8.1 (concise).
3. Create the **monorepo scaffold** (pnpm workspaces, TS config, lint/format, Vitest, fast-check) as a Quick Spec.
4. Create **spec #1: `render-pipeline`**. Goal: Number Reveal component with zod schema → live preview with Remotion Player in Next.js → local MP4 export (1080p, 30fps) → plan for Remotion Lambda export.
5. Set up **hooks #1 (component scaffolder)** and **#2 (component quality check)** as soon as the first component exists.
6. Start `KIRO_LOG.md` with the first entry.

Let's build something that looks like a real motion director made it. 🎬
