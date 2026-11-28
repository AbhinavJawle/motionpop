import { z } from 'zod';
import {
  BuiltInRecipeKeySchema,
  MusicMoodSchema,
  ReelHookStyleSchema,
  type MusicMood,
  type ReelHookStyle,
} from '@motionpop/schemas';
import type { Router, TaskDef } from '../router';
import { COMMUNITY_SKILLS, getCommunitySkillById } from '../skills/community-skills';
import { RECIPES, type BuiltInRecipeId } from '../skills/recipes';

/** Maximum transcript/prompt characters sent to the on-device setup recommender. */
export const SETUP_TRANSCRIPT_MAX = 1600;
export const SETUP_REASON_MAX = 120;

const COMMUNITY_SKILL_IDS = COMMUNITY_SKILLS.map((s) => s.id) as [string, ...string[]];
const SKILL_CHOICE_ENUM = ['none', ...COMMUNITY_SKILL_IDS] as [string, ...string[]];
const MOODS = MusicMoodSchema.options.filter((m) => m !== 'auto') as [
  Exclude<MusicMood, 'auto'>,
  ...Exclude<MusicMood, 'auto'>[],
];

export const SetupRecommendInputSchema = z.object({
  transcript: z.string().trim().min(1).max(SETUP_TRANSCRIPT_MAX),
  kind: z.enum(['video', 'voiceover', 'graphic']),
});
export type SetupRecommendInput = z.infer<typeof SetupRecommendInputSchema>;

export const SetupRecommendModelOutputSchema = z.object({
  recipeId: BuiltInRecipeKeySchema,
  skillId: z.enum(SKILL_CHOICE_ENUM),
  hookStyle: ReelHookStyleSchema,
  musicMood: z.enum(MOODS),
  reason: z.string().trim().min(1).max(SETUP_REASON_MAX),
});
export type SetupRecommendModelOutput = z.infer<typeof SetupRecommendModelOutputSchema>;

export interface SetupRecommendation {
  recipeId: BuiltInRecipeId;
  /** Matched open-source community skill ID, or undefined when a built-in recipe stands alone. */
  skillId?: string;
  /** Matching style ID for the given job kind (Reel style for video; Look ID for voiceover/graphic). */
  styleId: string;
  hookStyle: ReelHookStyle;
  musicMood: Exclude<MusicMood, 'auto'>;
  reason: string;
  /** `high` when strong topic signals or Gemini Nano matched; `low` for generic/short text. */
  confidence: 'high' | 'low';
  ranOn: 'device' | 'rules';
}

/** Exact talking-head Reel style paired with each open-source community skill. */
export const SKILL_VIDEO_STYLE: Readonly<Record<string, string>> = {
  'vox-paper-collage': 'vox-collage',
  'apple-launch-film': 'apple-keynote',
  'kinetic-reel': 'kinetic-lime',
  'saas-launch-film': 'launch-dark',
  'anti-ppt-motion': 'anti-ppt-coral',
  'financial-data-story': 'newsprint-ink',
  'kurzgesagt-flat-world': 'kurzgesagt-cosmos',
  '3b1b-visual-math': 'midnight-neon',
  'cinematic-3d-opener': 'launch-dark',
  'retro-terminal-brutalist': 'retro-terminal',
  'risograph-editorial-zine': 'risograph-zine',
  'minimal-geist-explainer': 'mono-grid',
  'director-cut-video-edit': 'warm-editorial',
  'product-demo-camera': 'liquid-glass',
  'blueprint-architectural': 'midnight-neon',
  'whiteboard-hand-drawn': 'warm-paper',
};

const SKILL_GUIDE = COMMUNITY_SKILLS.map(
  (s) => `- ${s.id} (${s.baseRecipeId}): ${s.name} — ${s.blurb}`,
).join('\n');

export const SETUP_RECOMMEND_SYSTEM_V1 = [
  'You are Motionpop’s creative director assistant.',
  'Read a creator’s spoken transcript or motion-graphic prompt and pick the single best starting recipe, open-source director skill, hook style, and music mood.',
  'Pick skillId="none" only for pure gaming or raw opinion rants where no open-source skill fits better; otherwise pick the strongest matching skillId.',
  'Keep recipeId consistent with the chosen skill or topic. For graphic kind, always set musicMood="none".',
  'Write a crisp 1-sentence reason (<= 100 chars) explaining why this look fits their exact topic.',
].join(' ');

export function setupRecommendPromptV1(input: SetupRecommendInput): string {
  const excerpt = input.transcript.trim().slice(0, 1200);
  return [
    `Project kind: ${input.kind}`,
    'Available open-source director skills:',
    SKILL_GUIDE,
    'Other built-in recipes: gaming (hyper-color gaming/streams), hot-take (bold opinion/contrarian), podcast-story (intimate stories).',
    '',
    'Transcript / prompt:',
    excerpt,
  ].join('\n');
}

/**
 * Hand-written draft-7 JSON schema for Chrome Gemini Nano (depth 1, 0 optional props,
 * max enum 17 <= 40, capped reason string).
 */
export function setupRecommendJsonSchema(): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      recipeId: { type: 'string', enum: RECIPES.map((r) => r.id) },
      skillId: { type: 'string', enum: [...SKILL_CHOICE_ENUM] },
      hookStyle: { type: 'string', enum: [...ReelHookStyleSchema.options] },
      musicMood: { type: 'string', enum: [...MOODS] },
      reason: { type: 'string', maxLength: SETUP_REASON_MAX },
    },
    required: ['recipeId', 'skillId', 'hookStyle', 'musicMood', 'reason'],
  };
}

/**
 * `setup.recommend`: reads the prepared transcript or prompt on-device (0 credits) and picks the
 * best recipe, open-source skill, style, hook, and music mood for `/start/configure`.
 */
export const setupRecommendTask: TaskDef<SetupRecommendInput, SetupRecommendModelOutput> = {
  id: 'setup.recommend',
  maxOutputTokens: 220,
  cacheable: true,
  promptVersion: 'v1',
  input: SetupRecommendInputSchema,
  output: SetupRecommendModelOutputSchema,
  mode: () => 'ONLY_ON_DEVICE',
  model: (cfg) => cfg.modelFast,
  system: SETUP_RECOMMEND_SYSTEM_V1,
  prompt: setupRecommendPromptV1,
  jsonSchema: setupRecommendJsonSchema,
  cloudCost: () => 0,
  cloudFallback: false,
  thinking: 'MINIMAL',
};

// ---------------------------------------------------------------------------------------------
// Deterministic weighted topic classifier (instant 0ms fallback for all browsers & offline).
// ---------------------------------------------------------------------------------------------

interface TopicRule {
  skillId?: string;
  recipeId: BuiltInRecipeId;
  videoStyleId: string;
  lookId: string;
  hookStyle: ReelHookStyle;
  musicMood: Exclude<MusicMood, 'auto'>;
  reason: string;
  /** High-signal terms (weight 3) and supporting terms (weight 1). */
  strong: readonly string[];
  weak: readonly string[];
}

const TOPIC_RULES: readonly TopicRule[] = [
  {
    skillId: 'apple-launch-film',
    recipeId: 'product-launch',
    videoStyleId: 'apple-keynote',
    lookId: 'apple-keynote',
    hookStyle: 'visual',
    musicMood: 'minimal-tech',
    reason: 'Product & hardware launch feel — Keynote Glass styling highlights the reveal.',
    strong: ['apple', 'keynote', 'macos', 'macbook', 'iphone', 'ipad', 'vision pro', 'introducing', 'announcing'],
    weak: ['hardware', 'device', 'flagship', 'unboxing', 'chip', 'display', 'battery', 'camera', 'launch'],
  },
  {
    skillId: 'saas-launch-film',
    recipeId: 'product-launch',
    videoStyleId: 'launch-dark',
    lookId: 'creator-dark',
    hookStyle: 'visual',
    musicMood: 'minimal-tech',
    reason: 'SaaS & product reveal — dark glass launch UI frames features crisply.',
    strong: ['saas', 'waitlist', 'startup launch', 'shipped', 'b2b', 'pricing tier', 'dashboard', 'workspace'],
    weak: ['platform', 'workflow', 'startup', 'beta', 'crm', 'customers', 'users', 'onboarding', 'subscription', 'app'],
  },
  {
    skillId: 'product-demo-camera',
    recipeId: 'product-launch',
    videoStyleId: 'liquid-glass',
    lookId: 'apple-keynote',
    hookStyle: 'visual',
    musicMood: 'minimal-tech',
    reason: 'Feature walkthrough & UI demo — smooth camera framing keeps focus on the interface.',
    strong: ['walkthrough', 'product demo', 'screen recording', 'feature tour', 'watch how', 'live demo'],
    weak: ['demo', 'click', 'button', 'shortcut', 'interface', 'ui', 'ux', 'menu', 'toolbar'],
  },
  {
    skillId: 'financial-data-story',
    recipeId: 'finance-business',
    videoStyleId: 'newsprint-ink',
    lookId: 'newsprint',
    hookStyle: 'stat',
    musicMood: 'minimal-tech',
    reason: 'Finance & market numbers — Newsprint data storytelling makes metrics pop.',
    strong: [
      'revenue',
      'valuation',
      'inflation',
      'federal reserve',
      'stock market',
      'earnings',
      'interest rate',
      'gdp',
      'investing',
      'portfolio',
      'arr',
      'profit margin',
      's&p 500',
      'wall street',
      'bloomberg',
    ],
    weak: ['billion', 'million', 'market', 'economy', 'money', 'stock', 'crypto', 'bitcoin', 'profit', 'roi', 'budget', 'debt', 'tax', 'fund', 'business', 'pricing'],
  },
  {
    skillId: 'vox-paper-collage',
    recipeId: 'documentary-explainer',
    videoStyleId: 'vox-collage',
    lookId: 'paper-collage',
    hookStyle: 'headline',
    musicMood: 'lofi',
    reason: 'Investigative & documentary explainer — Editorial Paper Collage brings context to life.',
    strong: [
      'vox',
      'geopolitics',
      'documentary',
      'history of',
      'why did',
      'how did',
      'explained',
      'journalism',
      'investigation',
      'empire',
      'borders',
    ],
    weak: ['history', 'war', 'city', 'map', 'culture', 'society', 'origin', 'century', 'decade', 'government', 'policy', 'secret', 'timeline', 'country', 'world'],
  },
  {
    skillId: 'kurzgesagt-flat-world',
    recipeId: 'documentary-explainer',
    videoStyleId: 'kurzgesagt-cosmos',
    lookId: 'creator-dark',
    hookStyle: 'headline',
    musicMood: 'dramatic',
    reason: 'Big science & cosmos concepts — vivid flat-world visuals simplify complex ideas.',
    strong: [
      'black hole',
      'quantum',
      'universe',
      'evolution',
      'galaxy',
      'consciousness',
      'climate change',
      'immune system',
      'kurzgesagt',
      'dna',
    ],
    weak: ['space', 'planet', 'stars', 'brain', 'biology', 'physics', 'atoms', 'science', 'earth', 'species', 'cells', 'energy', 'gravity', 'human body'],
  },
  {
    skillId: '3b1b-visual-math',
    recipeId: 'tech-explainer',
    videoStyleId: 'midnight-neon',
    lookId: 'blueprint-schematic',
    hookStyle: 'headline',
    musicMood: 'minimal-tech',
    reason: 'Math & algorithmic intuition — Visual Math diagrams clarify the proof.',
    strong: [
      'linear algebra',
      'calculus',
      'theorem',
      'neural network',
      'gradient descent',
      'fourier',
      'matrix',
      'derivative',
      'probability',
      'equation',
      '3blue1brown',
      'algorithm',
    ],
    weak: ['math', 'proof', 'vector', 'geometry', 'graph', 'function', 'formula', 'integral', 'eigenvalue', 'statistics', 'compute'],
  },
  {
    skillId: 'blueprint-architectural',
    recipeId: 'tech-explainer',
    videoStyleId: 'midnight-neon',
    lookId: 'blueprint-schematic',
    hookStyle: 'headline',
    musicMood: 'minimal-tech',
    reason: 'Systems & engineering architecture — Blueprint schematics map out how pieces connect.',
    strong: [
      'system design',
      'architecture',
      'distributed',
      'microservice',
      'kubernetes',
      'database',
      'latency',
      'compiler',
      'infrastructure',
      'protocol',
      'pipeline',
    ],
    weak: ['api', 'backend', 'docker', 'server', 'network', 'cache', 'queue', 'engine', 'schema', 'scale', 'throughput', 'cloud'],
  },
  {
    skillId: 'retro-terminal-brutalist',
    recipeId: 'kinetic-promo',
    videoStyleId: 'retro-terminal',
    lookId: 'creator-dark',
    hookStyle: 'visual',
    musicMood: 'minimal-tech',
    reason: 'CLI, security & low-level dev — Retro Terminal brutalism nails the hacker aesthetic.',
    strong: ['terminal', 'command line', 'linux', 'neovim', 'vim', 'rust', 'cybersecurity', 'exploit', 'kernel', 'bash', 'shell', 'cli'],
    weak: ['git', 'ssh', 'devops', 'hacker', 'security', 'open source', 'benchmark', 'binary', 'compile', 'script'],
  },
  {
    skillId: 'kinetic-reel',
    recipeId: 'kinetic-promo',
    videoStyleId: 'kinetic-lime',
    lookId: 'kinetic-lime',
    hookStyle: 'headline',
    musicMood: 'upbeat',
    reason: 'High-tempo hook & punchy beats — Kinetic Typography keeps retention locked.',
    strong: ['stop scrolling', 'unpopular opinion', 'brutal truth', 'nobody tells you', '3 things', '5 mistakes', 'three things', 'five mistakes'],
    weak: ['hot take', 'myth', 'rule', 'hack', 'viral', 'attention', 'fast', 'mistakes', 'secrets', 'truth', 'wrong'],
  },
  {
    skillId: 'anti-ppt-motion',
    recipeId: 'kinetic-promo',
    videoStyleId: 'anti-ppt-coral',
    lookId: 'kinetic-lime',
    hookStyle: 'headline',
    musicMood: 'upbeat',
    reason: 'Marketing, brand & pitch framing — bold anti-slide motion graphics stand out.',
    strong: ['pitch deck', 'copywriting', 'positioning', 'brand strategy', 'conversion rate', 'landing page', 'marketing'],
    weak: ['presentation', 'slide', 'brand', 'agency', 'growth', 'audience', 'funnel', 'messaging', 'sales'],
  },
  {
    skillId: 'risograph-editorial-zine',
    recipeId: 'documentary-explainer',
    videoStyleId: 'risograph-zine',
    lookId: 'risograph-zine',
    hookStyle: 'headline',
    musicMood: 'lofi',
    reason: 'Creative culture & design essay — Risograph zine ink gives it tactile character.',
    strong: ['risograph', 'zine', 'typography', 'cinema', 'indie film', 'album review', 'fashion', 'art history', 'design'],
    weak: ['art', 'film', 'music', 'book', 'essay', 'creative', 'aesthetic', 'magazine', 'photography', 'poster'],
  },
  {
    skillId: 'whiteboard-hand-drawn',
    recipeId: 'podcast-story',
    videoStyleId: 'warm-paper',
    lookId: 'field-notes',
    hookStyle: 'headline',
    musicMood: 'lofi',
    reason: 'Step-by-step teaching & mental models — hand-drawn whiteboard clarity helps viewers learn.',
    strong: ['step by step', 'mental model', 'for beginners', 'how to learn', 'framework', 'study method', 'whiteboard'],
    weak: ['how to', 'beginner', 'guide', 'lesson', 'teach', 'learn', 'tips', 'checklist', 'habit', 'tutorial', 'explained simply'],
  },
  {
    skillId: 'cinematic-3d-opener',
    recipeId: 'product-launch',
    videoStyleId: 'launch-dark',
    lookId: 'creator-dark',
    hookStyle: 'visual',
    musicMood: 'dramatic',
    reason: 'Bold trailer & future-vision tone — cinematic 3D lighting elevates the reveal.',
    strong: ['trailer', 'premiere', 'countdown', 'breakthrough', 'next generation', 'ai revolution', 'the future of'],
    weak: ['epic', 'future', 'vision', 'reveal', 'dramatic', 'cinema', 'era', 'bold'],
  },
  {
    skillId: 'director-cut-video-edit',
    recipeId: 'tech-explainer',
    videoStyleId: 'warm-editorial',
    lookId: 'editorial-cream',
    hookStyle: 'cold-open',
    musicMood: 'lofi',
    reason: 'Personal story & founder reflections — clean editorial cuts keep your voice front and center.',
    strong: ['behind the scenes', 'day in the life', 'i quit', 'i built', 'lesson i learned', 'founder story', 'my journey'],
    weak: ['story', 'journey', 'interview', 'podcast', 'failure', 'personal', 'honest', 'experience', 'reflection'],
  },
  {
    skillId: undefined,
    recipeId: 'gaming',
    videoStyleId: 'hyper-color',
    lookId: 'kinetic-lime',
    hookStyle: 'visual',
    musicMood: 'upbeat',
    reason: 'Gaming & stream highlights — high-energy HUD pacing matches the action.',
    strong: ['valorant', 'minecraft', 'fortnite', 'esports', 'speedrun', 'boss fight', 'twitch', 'ranked', 'loadout'],
    weak: ['gaming', 'gamer', 'clutch', 'stream', 'fps', 'kill', 'lobby', 'patch notes', 'playthrough'],
  },
  {
    skillId: 'minimal-geist-explainer',
    recipeId: 'tech-explainer',
    videoStyleId: 'mono-grid',
    lookId: 'studio-light',
    hookStyle: 'headline',
    musicMood: 'minimal-tech',
    reason: 'Clean tech & AI explainer — Minimal Geist grid typography keeps every point crisp.',
    strong: ['typescript', 'nextjs', 'react', 'gemini', 'claude', 'openai', 'llm', 'ai agent', 'developer'],
    weak: ['ai', 'model', 'code', 'coding', 'engineering', 'tech', 'software', 'tool', 'build', 'framework'],
  },
];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function matchPhrase(lower: string, phrase: string): boolean {
  return new RegExp(`(^|[^a-z0-9])${escapeRe(phrase)}(s|es)?([^a-z0-9]|$)`).test(lower);
}

/** True when the opening sentences lead with a concrete stat or dollar figure. */
function leadsWithStat(text: string): boolean {
  const head = text.slice(0, 220);
  return /(\$\s?\d|\d+(\.\d+)?\s?%|\b\d+\s?(billion|million|thousand|x)\b)/i.test(head);
}

function resolveStyleId(
  recipeId: BuiltInRecipeId,
  skillId: string | undefined,
  kind: SetupRecommendInput['kind'],
  fallbackVideoStyle?: string,
  fallbackLook?: string,
): string {
  const skill = skillId ? getCommunitySkillById(skillId) : undefined;
  const recipe = RECIPES.find((r) => r.id === recipeId) ?? RECIPES[0]!;
  if (kind === 'video') {
    const candidate =
      (skillId ? SKILL_VIDEO_STYLE[skillId] : undefined) ?? fallbackVideoStyle ?? recipe.styles[0]?.id;
    if (candidate && recipe.styles.some((s) => s.id === candidate)) return candidate;
    return recipe.styles[0]?.id ?? 'mono-grid';
  }
  return skill?.lookId ?? fallbackLook ?? recipe.defaults.voiceoverLook;
}

/**
 * Instant deterministic transcript/prompt classifier. Never throws; returns `confidence: 'low'`
 * when the text has no recognizable topic signals so callers can avoid overriding defaults on
 * empty/generic inputs.
 */
export function recommendSetupByKeywords(input: SetupRecommendInput): SetupRecommendation {
  const text = input.transcript.trim();
  const lower = text.toLowerCase();

  let bestRule: TopicRule | null = null;
  let bestScore = 0;

  for (const rule of TOPIC_RULES) {
    let score = 0;
    for (const term of rule.strong) {
      if (matchPhrase(lower, term)) score += 3;
    }
    for (const term of rule.weak) {
      if (matchPhrase(lower, term)) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      bestRule = rule;
    }
  }

  // Require at least 2 points (1 strong match or 2 supporting matches) for confident auto-pick.
  if (!bestRule || bestScore < 2) {
    const fallbackRecipe: BuiltInRecipeId =
      input.kind === 'graphic' ? 'documentary-explainer' : 'tech-explainer';
    const fallbackSkill = input.kind === 'graphic' ? 'vox-paper-collage' : 'minimal-geist-explainer';
    return {
      recipeId: fallbackRecipe,
      skillId: fallbackSkill,
      styleId: resolveStyleId(fallbackRecipe, fallbackSkill, input.kind),
      hookStyle: leadsWithStat(text) ? 'stat' : 'headline',
      musicMood: input.kind === 'graphic' ? 'none' : 'minimal-tech',
      reason: 'Clean editorial pacing tailored for general explainers.',
      confidence: 'low',
      ranOn: 'rules',
    };
  }

  const hookStyle: ReelHookStyle =
    bestRule.hookStyle === 'headline' && leadsWithStat(text) ? 'stat' : bestRule.hookStyle;
  const musicMood: Exclude<MusicMood, 'auto'> =
    input.kind === 'graphic' ? 'none' : bestRule.musicMood;

  return {
    recipeId: bestRule.recipeId,
    ...(bestRule.skillId ? { skillId: bestRule.skillId } : {}),
    styleId: resolveStyleId(
      bestRule.recipeId,
      bestRule.skillId,
      input.kind,
      bestRule.videoStyleId,
      bestRule.lookId,
    ),
    hookStyle,
    musicMood,
    reason: bestRule.reason,
    confidence: 'high',
    ranOn: 'rules',
  };
}

/** True when text has enough real human words (not just synthetic tokens like `word0 word1`) for AI. */
function hasMeaningfulTranscript(text: string): boolean {
  const words = text
    .trim()
    .split(/\s+/)
    .filter((w) => /[a-zA-Z]{2,}/.test(w) && !/^word\d+$/i.test(w));
  return words.length >= 4;
}

/**
 * Recommends the best recipe, open-source skill, style, hook & music mood for a transcript or
 * prompt. Runs Chrome Gemini Nano on-device (0 credits) when ready, falling back cleanly to the
 * instant keyword classifier on any failure or unsupported browser.
 */
export async function recommendSetup(
  router: Pick<Router, 'run'> | null,
  input: SetupRecommendInput,
): Promise<SetupRecommendation> {
  const trimmed = input.transcript.trim().slice(0, SETUP_TRANSCRIPT_MAX);
  if (!trimmed) {
    return recommendSetupByKeywords({ ...input, transcript: 'explainer' });
  }
  const cleanInput: SetupRecommendInput = { transcript: trimmed, kind: input.kind };

  if (router && hasMeaningfulTranscript(trimmed)) {
    try {
      const res = await router.run(setupRecommendTask, cleanInput, { allowCloud: false });
      const out = res.output;
      const skillId = out.skillId === 'none' ? undefined : out.skillId;
      const skill = skillId ? getCommunitySkillById(skillId) : undefined;
      const recipeId: BuiltInRecipeId = (skill?.baseRecipeId ?? out.recipeId) as BuiltInRecipeId;
      return {
        recipeId,
        ...(skillId ? { skillId } : {}),
        styleId: resolveStyleId(recipeId, skillId, input.kind),
        hookStyle: out.hookStyle,
        musicMood: input.kind === 'graphic' ? 'none' : out.musicMood,
        reason: out.reason,
        confidence: 'high',
        ranOn: 'device',
      };
    } catch {
      // Fall through to the instant keyword classifier: never blocks Configure.
    }
  }

  return recommendSetupByKeywords(cleanInput);
}
