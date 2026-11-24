import { APP_CONFIG_DEFAULTS, costOf, exportCost } from '@motionpop/schemas';

/**
 * Every word on the marketing site (spec 34), in page order, so the copy can be read and edited
 * in one place. Claims match the product: engines, skills, looks and prices from the live config
 * defaults.
 */

const cfg = APP_CONFIG_DEFAULTS;
const credits = (n: number) => (n === 0 ? 'Free' : `${n} credits`);

export const REPO = 'https://github.com/AbhinavJawle/motionpop';
export const FREE_CREDITS = cfg.freeCredits;

export const NAV = [
  { href: '/how-it-works', label: 'How it works' },
  { href: '#reels', label: 'Reels' },
  { href: '#hybrid', label: 'Hybrid AI' },
  { href: '#engine', label: 'Engine' },
  { href: '#pricing', label: 'Pricing' },
] as const;

export const HERO = {
  badge: '#BuildHybridAI · #KiroweenHackathon26',
  lines: ['AI short-form editor.', 'Immaculate motion.'],
  body: 'The agentic AI video editor built for short-form reels and studio-grade motion graphics. Drop raw talking-head footage, a voiceover or a script—Pip auto-cuts retakes, directs animated scenes synced to every word, and edits locally on your device.',
  secondary: 'See the editor',
  note: `${cfg.freeCredits} free credits to start · Local Gemini Nano edits free forever · Open source (Apache-2.0)`,
};

/** What the AI editor hears or sees, and what it executes on the timeline. */
export const TICKER: readonly { said: string; graphic: string }[] = [
  { said: 'stumbled retake + 2s pause', graphic: 'Auto-cut' },
  { said: 'raw vertical talking-head', graphic: 'Directed 9:16 reel' },
  { said: 'revenue grew ninety percent', graphic: 'Animated bar chart' },
  { said: 'circled frame + “slower”', graphic: 'On-device patch' },
  { said: 'imported SKILL.md', graphic: 'Custom edit style' },
  { said: 'three steps to ship', graphic: 'Motion flow' },
  { said: '“rocket made of bars”', graphic: 'Sandboxed code' },
  { said: 'key punchline word', graphic: '1.15× punch-in' },
];

/** Hand-written notes pinned to the real reel editor screenshot. */
export const FRAME_NOTES = {
  formats: 'ask Pip anything — powered by Gemini 4 Neon',
  edit: '9:16 reels + deterministic motion graphics',
  slot: 'auto-cuts retakes & pauses non-destructively',
};

export const REELS = {
  title: 'Real reels. Immaculate motion.',
  body: 'Every cut below is compiled by Motionpop’s deterministic engine—real talking-head footage paired with frame-accurate charts, workflows, checklists and kinetic typography. Pick from 5 editing recipes, 8 looks, or import a Markdown SKILL.md straight from GitHub.',
  items: [
    {
      id: 'reel-split',
      src: '/landing/reel-split.jpg',
      tag: 'Mono · Split',
      name: 'AI Pipeline',
      about: 'Talking-head reel with animated workflow diagrams and word-locked seam captions.',
    },
    {
      id: 'reel-cream',
      src: '/landing/reel-cream.jpg',
      tag: 'Cream · Chart',
      name: 'Data Story',
      about: 'Editorial cream bar charts synced directly to spoken stats and podcast narration.',
    },
    {
      id: 'reel-card',
      src: '/landing/reel-card.jpg',
      tag: 'Card · Auto-Edit',
      name: 'Creator Checklist',
      about: 'Rounded studio card framed under live checklists and punchy pop captions.',
    },
    {
      id: 'reel-tokyo',
      src: '/landing/reel-tokyo.jpg',
      tag: 'Full · Bleed',
      name: 'Documentary Cut',
      about: 'Full-bleed visual storytelling with bold timed statistics and boxed captions.',
    },
  ],
  save: 'Import your own SKILL.md from GitHub or save a custom look—Pip directs every future video your way.',
} as const;

export const HYBRID = {
  title: 'On-device speed. Cloud-scale direction.',
  body: 'Hybrid AI is the architecture, not a checkbox. Motionpop routes every edit through one transparent router—local Chrome AI for instant free tweaks, frontier cloud Gemini for full video directing—and shows the route before you click.',
  device: {
    title: 'Local edge AI, in Chrome',
    body: 'Whisper transcribes in a local WebGPU/WASM worker while Gemini Nano runs inside Chrome through Firebase AI Logic. Slot detection, auto-fill, quick edits and multimodal frame notes cost $0, stay on your machine and keep working offline.',
    input: 'make it slower and highlight Q4',
    chip: 'free · on-device',
  },
  cloud: {
    title: 'Frontier cloud, when it counts',
    body: 'Full talking-head directing across 21 reel templates, multi-beat film storyboards, sandboxed custom motion code, Vision QA and Gemini TTS run in the cloud—or paste your own Google AI Studio Gemini key in Settings for 0 Motionpop credits.',
    button: 'Generate',
  },
  bubble: 'Route shown before every click.',
} as const;

export const PLANS = {
  title: 'One AI editor. The whole timeline.',
  body: 'Direct Pip across video cuts, motion graphics, captions, music and brand tokens. Multi-step requests return an inspectable execution plan with exact credit cost—apply atomically, or revert the entire edit in one undo.',
  ask: 'Cut the double takes, apply my brand colours across every scene, and make the opening hook punchier.',
  planTitle: 'Execution plan · 3 steps',
  steps: [
    'Trim 4 retakes & dead-air pauses non-destructively',
    'Swap brand palette across 8 reel scenes & captions',
    'Rewrite opening hook beat and re-verify DOM layout',
  ],
  apply: 'Apply all',
  undo: 'Undo',
  bubble: 'Plan ready. 1-click undo.',
} as const;

export const FEATURES = {
  title: 'Built like an engine. Directed by AI.',
  body: 'Everything between raw footage and a frame-accurate 1080p cut—checked by static linters, DOM layout gates and a Vision critic.',
  items: {
    autocut: {
      title: 'Auto-cut raw video & punch-ins',
      body: 'Drop raw talking-head MP4, MOV or WebM footage. Motionpop trims silences, fillers, false starts and retakes non-destructively, adds punch-in zooms, and maps face-safe zones so graphics never cover you.',
    },
    notes: {
      title: 'Draw-on-frame multimodal editing',
      body: 'Circle anything on the video canvas and leave a note. A cropped JPEG plus your instruction runs on-device with Gemini Nano for instant patches—or escalates to cloud for full scene rewrites.',
      scribble: 'make this slower',
    },
    captions: {
      title: 'Word-locked captions',
      body: 'Local Whisper word timings drive animated captions that light up on the exact syllable across 5 reel and explainer styles.',
    },
    custom: {
      title: 'Sandboxed custom motion code',
      body: 'Need a graphic outside the 21 templates? The agent writes deterministic seek(t) HTML/SVG code, runs static lint and DOM overflow/contrast checks, and self-repairs before it hits your timeline.',
    },
    film: {
      title: 'Dual Reel & Film engines',
      body: 'Direct a talking-head short across 21 vertical templates or storyboard a full multi-beat motion film with parallel scene builds and a Vision QA critic that inspects every shot.',
    },
    sound: {
      title: 'Procedural audio & soundtracks',
      body: 'Pops, whooshes and ticks synthesized in code to land on every graphic entrance, plus Gemini TTS voiceovers and ducked soundtracks—zero stock hunting.',
    },
    formats: {
      title: 'Deterministic reflow & parity',
      body: 'Because every frame is compiled code—not melted diffusion pixels—switching 9:16, 16:9 and 1:1 reflows every graphic cleanly, and Cloud Run exports match preview pixel-for-pixel.',
    },
  },
} as const;

export const WHY = {
  title: 'Why not black-box AI video?',
  body: 'Pixel-diffusion video generators bake frames you can’t edit and mangle text. Motionpop edits real footage and compiles immaculate, inspectable motion graphics.',
  items: [
    {
      title: 'Editable down to the millisecond',
      body: 'Every cut, word, chart value, colour and timing is structured JSON on an integer-millisecond timeline. Fix a number or swap a look in seconds—never re-roll a whole clip.',
    },
    {
      title: 'Verified before it reaches you',
      body: 'Every AI output passes Zod schema validation, static determinism linting, off-screen DOM layout and contrast gates, and a Vision QA critic with automated repair.',
    },
    {
      title: 'Built for real creator workflows',
      body: 'Short-form creators, explainer channels and video editors export 1080p MP4s, transparent WebM overlays for external timelines, and reusable SKILL.md direction recipes.',
    },
  ],
} as const;

export const STITCHED = {
  title: 'Stitched together. Brought to life.',
  body: 'Six specialized engines wired into one open-source AI video editor—local edge AI, frontier cloud models, deterministic rendering and spec-driven engineering. Count every stitch.',
  parts: [
    {
      name: 'Whisper WebGPU/WASM',
      job: 'Word-level integer-ms transcription and speech cuts right in a local browser worker',
    },
    {
      name: 'Gemini Nano + AI Logic',
      job: 'Free, offline multimodal quick edits, frame notes and auto-fill in Chrome via Firebase AI Logic',
    },
    {
      name: 'Gemini 4 Neon + Vision QA',
      job: 'Agentic video directing, sandboxed custom motion code, Vision critic, TTS and bespoke art',
    },
    {
      name: 'Deterministic Motion Core',
      job: 'Pure seek(t) HTML/SVG components, 8 looks, 21 reel templates and procedural SFX',
    },
    {
      name: 'HyperFrames + Cloud Run',
      job: 'Preview-to-MP4 parity (≤ 1.02% diff) rendered from the exact same HTML composition',
    },
    {
      name: 'Kiro Spec-Driven Build',
      job: '44 EARS specs, steering rules, hooks and property-tested boundaries live in /.kiro',
    },
  ],
  bubble: 'It’s alive!',
  cta: 'Read the source',
} as const;

export const PRICING = {
  title: 'Start free. Pay only for the cloud.',
  body: 'No tiers to decode. Credits pay only for cloud directing and generation—on-device Chrome AI and 1080p exports are free.',
  plan: 'Free plan',
  planNote: `${cfg.freeCredits} credits on sign-up`,
  perks: [
    'Raw video auto-cut, 21 reel templates & 8 looks',
    'Unlimited on-device Gemini Nano edits & SKILL.md imports',
    'Free 1080p MP4 & transparent WebM overlay exports',
  ],
  rows: [
    { label: 'Quick edits, frame notes & auto-fill on your device', cost: 'Free' },
    { label: 'Direct a talking-head reel', cost: credits(costOf('reel', 1, cfg)) },
    { label: 'Custom sandboxed motion graphic or cloud slot', cost: credits(costOf('custom', 1, cfg)) },
    {
      label: 'Direct a multi-beat AI motion film (per 30s)',
      cost: credits(costOf('film', 1, cfg)),
    },
    {
      label: 'Export 1080p MP4 with captions & audio',
      cost: credits(exportCost('1080p', 60_000, cfg.exportCredits)),
    },
  ],
  footnote:
    'Exact route and credit cost show on every button before you click. Failed jobs refund automatically. Or bring your own Google AI Studio Gemini API key in Settings (stored only in your browser) to run cloud Gemini tasks at 0 Motionpop credits.',
};

export const FAQ = {
  title: 'Good questions.',
  body: 'Straight answers. Pip insists.',
  items: [
    {
      q: 'What inputs can I start from?',
      a: 'Drop raw talking-head video (MP4, MOV, WebM), upload a voiceover (MP3, WAV, M4A), record straight in the browser, or paste a script and generate narration with Gemini TTS.',
    },
    {
      q: 'How is this different from generative AI video tools?',
      a: 'Generative video models bake pixels that hallucinate text and can’t be edited. Motionpop edits your real footage and compiles deterministic seek(t) HTML/SVG motion graphics on a millisecond timeline—so every cut, number, word, colour and aspect ratio stays editable with pixel-accurate preview-to-export parity.',
    },
    {
      q: 'How does Hybrid AI work in the browser?',
      a: 'In desktop Chrome with Gemini Nano enabled, Firebase AI Logic runs quick edits, draw-on-frame notes, slot detection and auto-fill locally at zero credit cost and even offline. Other browsers automatically fall back to cloud Gemini, and Motionpop always shows the route before you click.',
    },
    {
      q: 'What are SKILL.md director skills and recipes?',
      a: 'Modular Markdown files that define pacing, look, hook style, captions and directing rules. Start from a built-in recipe, write your own skill, or import a SKILL.md directly from GitHub to direct every future video in your style.',
    },
    {
      q: 'Can I edit everything Pip generates?',
      a: 'Every auto-cut, punch-in, caption, data point, colour and timing is non-destructive and versioned. Edit fields in the inspector, type a quick edit, circle anything on the frame, or ask Pip for a multi-step plan with single-click undo.',
    },
    {
      q: 'Can I bring my own Gemini API key?',
      a: 'Yes. Paste a Google AI Studio Gemini API key in Settings → AI & models. It stays only in your browser’s localStorage, calls Google directly via the x-goog-api-key header, keeps local on-device Gemini Nano first, and runs cloud Gemini tasks at 0 Motionpop credits.',
    },
    {
      q: 'What do I export, and is it really open source?',
      a: 'Export 720p or 1080p MP4s in 9:16, 16:9 or 1:1—or transparent WebM overlays to drop into another editor—plus shareable links. The full codebase and 45 Kiro specs are open source under Apache-2.0.',
    },
  ],
} as const;

export const CLOSER = {
  title: 'Drop raw footage. Ship immaculate motion.',
  body: 'Open-source AI video editing, hybrid local + cloud inference, editable to the millisecond.',
};

export const FOOTER = {
  tagline: 'The AI video editor for short-form reels & immaculate motion graphics.',
  small: 'Open source under Apache-2.0. Hybrid AI powered by Chrome Gemini Nano & Firebase AI Logic.',
};
