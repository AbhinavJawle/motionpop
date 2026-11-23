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
  /** Share of the runtime per layout (targets; they sum to 1). */
  layoutMix: Readonly<Record<ReelLayout, number>>;
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
];
