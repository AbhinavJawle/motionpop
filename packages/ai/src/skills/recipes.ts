// Spec 39 R3: the built-in recipes. Each is a director skill for the reel engine (pacing, layout
// mix, templates, hook, grammar, music, banned tropes) plus 2–3 curated styles. Original names
// only. Mirrored for people in `skills/recipes/<id>.md` (a test keeps both in sync).
import type {
  MusicMood,
  ReelCaptionStyle,
  ReelHookStyle,
  ReelLayout,
  ReelLook,
  ReelTemplateId,
  ReelTheme,
  RecipeId,
} from '@motionpop/schemas';

export type BuiltInRecipeId = Exclude<RecipeId, 'custom'>;

export interface RecipeStyle {
  id: string;
  name: string;
  look: ReelLook;
  /** Absent: the look's own colours. */
  theme?: ReelTheme;
  captionStyle: ReelCaptionStyle;
  /** Card art on the configure screen: ground, ink, accent. */
  swatch: readonly [string, string, string];
}

export interface DirectorSkill {
  id: BuiltInRecipeId;
  name: string;
  /** One line under the card. */
  blurb: string;
  sceneMs: { min: number; max: number };
  /** Share of the runtime per base layout (targets; they sum to 1). */
  layoutMix: Readonly<Record<Exclude<ReelLayout, 'pip'>, number>>;
  preferredTemplates: readonly ReelTemplateId[];
  hookPattern: string;
  visualGrammar: string;
  bannedTropes: readonly string[];
  /** The music brief this recipe asks for when the mood is `auto`. */
  musicBrief: string;
  sfxDensity: 'low' | 'medium' | 'high';
  defaults: {
    hookStyle: ReelHookStyle;
    music: Exclude<MusicMood, 'auto'>;
    /** The voiceover look for audio and script inputs (R3.7). */
    voiceoverLook: string;
    ctaEnabled: boolean;
  };
  /** Words that point a "describe your own" text at this recipe (the keyword resolver). */
  keywords: readonly string[];
  styles: readonly RecipeStyle[];
}

export const RECIPES: readonly DirectorSkill[] = [
  {
    id: 'tech-explainer',
    name: 'Tech Explainer',
    blurb: 'Tools, code and products, shown on every word.',
    sceneMs: { min: 1200, max: 3200 },
    layoutMix: { split: 0.45, card: 0.1, full: 0.2, speaker: 0.25 },
    preferredTemplates: [
      'logo',
      'logos',
      'terminal',
      'flow',
      'compare',
      'list',
      'website',
      'checklist',
    ],
    hookPattern:
      'Open on the tool or the result: a logo, a site or a bold claim the reel then proves.',
    visualGrammar:
      'Every named tool appears as its logo on the word. Steps become flows, commands become terminals, options become stacks. Lists grow across cuts.',
    bannedTropes: [
      'generic circuit-board backgrounds',
      'robot imagery',
      'matrix rain',
      'stock "hacker in a hoodie"',
    ],
    musicBrief:
      'Confident minimal tech house, soft synth plucks, tight hats, warm sub bass, 118 bpm',
    sfxDensity: 'medium',
    defaults: {
      hookStyle: 'visual',
      music: 'minimal-tech',
      voiceoverLook: 'studio-light',
      ctaEnabled: true,
    },
    keywords: [
      'tech',
      'code',
      'coding',
      'app',
      'software',
      'ai',
      'tool',
      'developer',
      'product',
      'startup',
      'tutorial',
    ],
    styles: [
      {
        id: 'mono-grid',
        name: 'Mono Grid',
        look: 'mono',
        captionStyle: 'seam',
        swatch: ['#FFFFFF', '#0B0B0C', '#5A57F0'],
      },
      {
        id: 'warm-editorial',
        name: 'Warm Editorial',
        look: 'cream',
        theme: { accent: '#C2552D', background: 'soft' },
        captionStyle: 'pop',
        swatch: ['#F4F1EC', '#1C1A17', '#C2552D'],
      },
      {
        id: 'midnight-neon',
        name: 'Midnight Neon',
        look: 'mono',
        theme: { accent: '#22D3EE', accent2: '#8B5CF6', background: 'bold' },
        captionStyle: 'boxed',
        swatch: ['#0B0B14', '#F2F2F7', '#22D3EE'],
      },
    ],
  },
  {
    id: 'finance-business',
    name: 'Finance & Business',
    blurb: 'Numbers that land, charts that prove the point.',
    sceneMs: { min: 1500, max: 3600 },
    layoutMix: { split: 0.35, card: 0.3, full: 0.1, speaker: 0.25 },
    preferredTemplates: [
      'counter',
      'chart',
      'compare',
      'checklist',
      'logo',
      'statement',
      'headline',
    ],
    hookPattern:
      'Lead with the number: the stat or the money amount the reel is about, counted up on its word.',
    visualGrammar:
      'Only numbers actually said become counters and charts. Before/after and this-vs-that become compare cards. Companies appear as logos. Calm, exact, no hype.',
    bannedTropes: [
      'stacks of cash',
      'rocket-to-the-moon imagery',
      'invented figures',
      'flashing red and green tickers',
    ],
    musicBrief: 'Measured cinematic pulse, muted piano, soft strings, steady low drum, 96 bpm',
    sfxDensity: 'low',
    defaults: {
      hookStyle: 'stat',
      music: 'dramatic',
      voiceoverLook: 'newsprint',
      ctaEnabled: true,
    },
    keywords: [
      'finance',
      'money',
      'market',
      'stock',
      'invest',
      'business',
      'economy',
      'revenue',
      'budget',
      'crypto',
      'company',
    ],
    styles: [
      {
        id: 'newsprint-ink',
        name: 'Newsprint Ink',
        look: 'mono',
        theme: { accent: '#111111', background: 'plain' },
        captionStyle: 'editorial',
        swatch: ['#F7F5F0', '#111111', '#B91C1C'],
      },
      {
        id: 'executive-cream',
        name: 'Executive Cream',
        look: 'cream',
        captionStyle: 'pop',
        swatch: ['#F4F1EC', '#1C1A17', '#A16207'],
      },
      {
        id: 'market-dark',
        name: 'Market Dark',
        look: 'mono',
        theme: { accent: '#22C55E', accent2: '#0EA5E9', background: 'bold' },
        captionStyle: 'clean',
        swatch: ['#0C1210', '#ECFDF5', '#22C55E'],
      },
    ],
  },
  {
    id: 'gaming',
    name: 'Gaming',
    blurb: 'Fast cuts, loud colour, big reactions.',
    sceneMs: { min: 900, max: 2600 },
    layoutMix: { split: 0.3, card: 0.15, full: 0.25, speaker: 0.3 },
    preferredTemplates: ['punch', 'counter', 'compare', 'stack', 'image', 'logos', 'statement'],
    hookPattern:
      'Open on the moment: the clip, the score or the wildest claim, in one punchy line.',
    visualGrammar:
      'Short scenes, punchlines on speaker shots, rankings as stacks, versus as compare cards. Energy over explanation; every beat changes something on screen.',
    bannedTropes: [
      'real game logos or characters unless named',
      'controller clip art',
      'pixel-art filler',
    ],
    musicBrief: 'High-energy electronic, punchy drums, gritty bass, bright arps, 140 bpm',
    sfxDensity: 'high',
    defaults: {
      hookStyle: 'headline',
      music: 'upbeat',
      voiceoverLook: 'creator-dark',
      ctaEnabled: true,
    },
    keywords: [
      'game',
      'gaming',
      'gamer',
      'stream',
      'play',
      'level',
      'boss',
      'speedrun',
      'console',
      'esports',
    ],
    styles: [
      {
        id: 'hyper-color',
        name: 'Hyper Color',
        look: 'mono',
        theme: { accent: '#EC4899', accent2: '#22D3EE', background: 'bold' },
        captionStyle: 'boxed',
        swatch: ['#12061A', '#FFFFFF', '#EC4899'],
      },
      {
        id: 'clean-hud',
        name: 'Clean HUD',
        look: 'mono',
        theme: { accent: '#38BDF8', background: 'soft' },
        captionStyle: 'clean',
        swatch: ['#F5F9FC', '#0B1220', '#38BDF8'],
      },
      {
        id: 'bold-meme',
        name: 'Bold Meme',
        look: 'cream',
        theme: { accent: '#FACC15', background: 'bold' },
        captionStyle: 'boxed',
        swatch: ['#FFF8DC', '#111111', '#FACC15'],
      },
    ],
  },
  {
    id: 'podcast-story',
    name: 'Podcast & Story',
    blurb: 'Room to breathe; the words carry it.',
    sceneMs: { min: 2000, max: 4800 },
    layoutMix: { split: 0.2, card: 0.25, full: 0.15, speaker: 0.4 },
    preferredTemplates: ['quote', 'image', 'statement', 'headline', 'punch'],
    hookPattern: 'Open mid-story: the most intriguing line, as a quiet title over the speaker.',
    visualGrammar:
      'Fewer, longer scenes. Quotes for the lines that matter, illustrations for places and moments described, speaker shots for the emotional beats.',
    bannedTropes: ['microphone clip art', 'waveform filler', 'busy lists', 'shouting punchlines'],
    musicBrief: 'Warm lo-fi, soft keys, brushed drums, gentle vinyl texture, 82 bpm',
    sfxDensity: 'low',
    defaults: {
      hookStyle: 'cold-open',
      music: 'lofi',
      voiceoverLook: 'editorial-cream',
      ctaEnabled: false,
    },
    keywords: [
      'podcast',
      'story',
      'interview',
      'conversation',
      'storytelling',
      'history',
      'personal',
      'memoir',
      'episode',
    ],
    styles: [
      {
        id: 'warm-paper',
        name: 'Warm Paper',
        look: 'cream',
        captionStyle: 'editorial',
        swatch: ['#F4F1EC', '#1C1A17', '#9A3412'],
      },
      {
        id: 'intimate-clean',
        name: 'Intimate Clean',
        look: 'mono',
        theme: { accent: '#64748B', background: 'plain' },
        captionStyle: 'clean',
        swatch: ['#FFFFFF', '#1F2937', '#64748B'],
      },
    ],
  },
  {
    id: 'hot-take',
    name: 'Hot Take',
    blurb: 'One bold claim, defended hard, built to be shared.',
    sceneMs: { min: 1000, max: 2800 },
    layoutMix: { split: 0.3, card: 0.1, full: 0.15, speaker: 0.45 },
    preferredTemplates: ['punch', 'statement', 'compare', 'headline', 'counter', 'stack'],
    hookPattern: 'Open on the claim itself, stated as bluntly as the speaker says it.',
    visualGrammar:
      'Speaker-led. Punchlines on the strongest words, statements with strike-throughs for what they reject, compare cards for wrong vs right. Ends on the ask.',
    bannedTropes: [
      'fire emojis',
      'clickbait arrows and circles',
      'fake shock faces',
      'invented statistics',
    ],
    musicBrief:
      'Driving trap-influenced beat, deep 808, sharp claps, tense synth stab, 150 bpm half-time',
    sfxDensity: 'high',
    defaults: {
      hookStyle: 'headline',
      music: 'dramatic',
      voiceoverLook: 'creator-dark',
      ctaEnabled: true,
    },
    keywords: [
      'opinion',
      'hot take',
      'rant',
      'unpopular',
      'controversial',
      'viral',
      'debate',
      'truth',
      'myth',
      'overrated',
    ],
    styles: [
      {
        id: 'high-contrast',
        name: 'High Contrast',
        look: 'mono',
        captionStyle: 'seam',
        swatch: ['#FFFFFF', '#000000', '#000000'],
      },
      {
        id: 'flame-punch',
        name: 'Flame Punch',
        look: 'mono',
        theme: { accent: '#FF5A1F', accent2: '#FACC15', background: 'bold' },
        captionStyle: 'boxed',
        swatch: ['#160A05', '#FFFFFF', '#FF5A1F'],
      },
    ],
  },
  {
    id: 'product-launch',
    name: 'Product Launch',
    blurb: 'Hardware-grade glass UI, live prompts & launch-day reveals.',
    sceneMs: { min: 1600, max: 3800 },
    layoutMix: { split: 0.4, full: 0.35, speaker: 0.15, card: 0.1 },
    preferredTemplates: [
      'website',
      'logo',
      'browser',
      'counter',
      'flow',
      'compare',
      'headline',
      'cta',
    ],
    hookPattern:
      'Open with one unforgettable 3–5 word promise or a live product UI moment in the first 3 seconds — never a slow logo fade.',
    visualGrammar:
      'Show the real interface very close, float frosted glass panels over rich gradients, reserve typing strictly for inside product input boxes, never repeat the same beat layout twice, and close on a held CTA.',
    bannedTropes: [
      'typewriter reveals on headlines',
      'invented metrics or fake testimonials',
      'generic neon glow orbs',
      'identical card grids repeated for every feature',
    ],
    musicBrief:
      'Modern crisp electronic launch score, glassy arpeggios, tight sub pulse, uplifting build, 116 bpm',
    sfxDensity: 'medium',
    defaults: {
      hookStyle: 'visual',
      music: 'minimal-tech',
      voiceoverLook: 'apple-keynote',
      ctaEnabled: true,
    },
    keywords: [
      'launch',
      'apple',
      'keynote',
      'saas',
      'demo',
      'promo',
      'release',
      'announcement',
      'feature',
      'iphone',
      'mac',
      'glass',
    ],
    styles: [
      {
        id: 'apple-keynote',
        name: 'Keynote Glass',
        look: 'mono',
        theme: { accent: '#38BDF8', accent2: '#818CF8', background: 'bold' },
        captionStyle: 'clean',
        swatch: ['#0A0E17', '#F8FAFC', '#38BDF8'],
      },
      {
        id: 'liquid-glass',
        name: 'Liquid Glass',
        look: 'mono',
        theme: { accent: '#6366F1', accent2: '#22D3EE', background: 'soft' },
        captionStyle: 'pop',
        swatch: ['#F8FAFC', '#0F172A', '#6366F1'],
      },
      {
        id: 'launch-dark',
        name: 'Launch Dark',
        look: 'mono',
        theme: { accent: '#F59E0B', accent2: '#38BDF8', background: 'bold' },
        captionStyle: 'seam',
        swatch: ['#0B0D14', '#FFFFFF', '#F59E0B'],
      },
    ],
  },
  {
    id: 'documentary-explainer',
    name: 'Documentary Explainer',
    blurb: 'Editorial paper collage, cutouts, riso print & visual journalism.',
    sceneMs: { min: 2000, max: 4400 },
    layoutMix: { full: 0.45, split: 0.3, card: 0.15, speaker: 0.1 },
    preferredTemplates: [
      'image',
      'chart',
      'counter',
      'flow',
      'quote',
      'headline',
      'compare',
      'list',
    ],
    hookPattern:
      'Open with the big "why" question or visual surprise immediately in the first 3 seconds, then prove it with layered visual evidence.',
    visualGrammar:
      'Layer tactile paper, graph-paper patches, halftone dots, masking tape, keyed photographic/illustrated cutouts, highlighter sweeps, and curved leader arrows. Pair wide establishing beats with tight detail cut-ins.',
    bannedTropes: [
      'flat corporate PowerPoint bullet slides',
      'invented facts, dates, or statistics',
      'stock clipart icons',
      'static unmotivated camera holds',
    ],
    musicBrief:
      'Editorial documentary pulse, plucked strings, marimba ticks, warm bassline, curious momentum, 108 bpm',
    sfxDensity: 'medium',
    defaults: {
      hookStyle: 'headline',
      music: 'lofi',
      voiceoverLook: 'paper-collage',
      ctaEnabled: false,
    },
    keywords: [
      'vox',
      'documentary',
      'collage',
      'explainer',
      'journalism',
      'history',
      'politics',
      'science',
      'kurzgesagt',
      'essay',
      'cutout',
      'risograph',
    ],
    styles: [
      {
        id: 'vox-collage',
        name: 'Editorial Collage',
        look: 'cream',
        theme: { accent: '#D96648', accent2: '#5E7F6A', background: 'soft' },
        captionStyle: 'editorial',
        swatch: ['#DFCDB7', '#1F1A17', '#D96648'],
      },
      {
        id: 'risograph-zine',
        name: 'Risograph Zine',
        look: 'cream',
        theme: { accent: '#E11D48', accent2: '#1D4ED8', background: 'soft' },
        captionStyle: 'boxed',
        swatch: ['#F5EDE0', '#182138', '#E11D48'],
      },
      {
        id: 'kurzgesagt-cosmos',
        name: 'Cosmos Flat Vector',
        look: 'mono',
        theme: { accent: '#22D3EE', accent2: '#F59E0B', background: 'bold' },
        captionStyle: 'pop',
        swatch: ['#0D132B', '#F8FAFC', '#22D3EE'],
      },
    ],
  },
  {
    id: 'kinetic-promo',
    name: 'Kinetic Promo',
    blurb: 'Beat-locked kinetic type, rotating grounds & anti-PPT slams.',
    sceneMs: { min: 900, max: 2400 },
    layoutMix: { full: 0.4, split: 0.3, speaker: 0.2, card: 0.1 },
    preferredTemplates: ['punch', 'stack', 'counter', 'headline', 'compare', 'terminal', 'logos'],
    hookPattern:
      'Hit hard in the first 1.5 seconds with a bold ≤4-word slam, rotating ground contrast, and immediate kinetic rhythm.',
    visualGrammar:
      'One shot = one punch (≤5 words). Rotate grounds across cuts (obsidian, lime, cream, cobalt), frame with subtle mono HUD metadata and segmented progress traces, use asymmetric fast-out exits, and make every beat prove a mechanism.',
    bannedTropes: [
      'multi-sentence slide paragraphs',
      'slow linear fades',
      'unmotivated shake or spin presets on every cut',
      'generic corporate stock imagery',
    ],
    musicBrief:
      'Punchy modern kinetic electronic beat, tight snare hits, crisp percussive groove, 124 bpm',
    sfxDensity: 'high',
    defaults: {
      hookStyle: 'headline',
      music: 'upbeat',
      voiceoverLook: 'kinetic-lime',
      ctaEnabled: true,
    },
    keywords: [
      'kinetic',
      'showreel',
      'reel',
      'typography',
      'opener',
      'bumper',
      'hype',
      'fast',
      'terminal',
      'brutalist',
      'portfolio',
      'sizzle',
    ],
    styles: [
      {
        id: 'kinetic-lime',
        name: 'Kinetic Lime',
        look: 'mono',
        theme: { accent: '#DDF53D', accent2: '#2F3CFF', background: 'bold' },
        captionStyle: 'boxed',
        swatch: ['#0E0F0E', '#F1EEE6', '#DDF53D'],
      },
      {
        id: 'anti-ppt-coral',
        name: 'Anti-PPT Coral',
        look: 'mono',
        theme: { accent: '#FF6A3D', accent2: '#14B8A6', background: 'bold' },
        captionStyle: 'seam',
        swatch: ['#111114', '#FFFFFF', '#FF6A3D'],
      },
      {
        id: 'retro-terminal',
        name: 'Retro Terminal',
        look: 'mono',
        theme: { accent: '#22C55E', accent2: '#FACC15', background: 'bold' },
        captionStyle: 'clean',
        swatch: ['#08100B', '#DCFCE7', '#22C55E'],
      },
    ],
  },
];
