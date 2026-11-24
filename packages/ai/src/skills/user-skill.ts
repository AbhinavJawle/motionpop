import {
  BuiltInRecipeKeySchema,
  ReelCaptionStyleSchema,
  ReelHookStyleSchema,
  ReelLookSchema,
  SkillHexColorSchema,
  SkillMusicMoodSchema,
  USER_SKILL_INSTRUCTIONS_MAX,
  USER_SKILL_MAX_MD_CHARS,
  UserSkillRefSchema,
  UserSkillTargetSchema,
  type BuiltInRecipeKey,
  type ReelCaptionStyle,
  type ReelHookStyle,
  type ReelLook,
  type UserSkill,
  type UserSkillRef,
  type UserSkillTarget,
} from '@motionpop/schemas';

/**
 * Parsing, condensing, and URL helpers for modular Markdown skills (`SKILL.md`, Spec 43).
 * Lets creators import external agent/video skills (e.g. from GitHub repos) or author their own
 * and inject their creative direction cleanly into `reel.direct` and `film.direct`.
 */

export interface ParsedSkillDraft {
  id: string;
  name: string;
  blurb: string;
  target: UserSkillTarget;
  baseRecipeId: BuiltInRecipeKey;
  look: ReelLook;
  accent: string;
  captionStyle: ReelCaptionStyle;
  hookStyle: ReelHookStyle;
  music: UserSkill['music'];
  markdown: string;
  sourceUrl?: string;
}

/** Converts any title or filename into a valid lowercase skill slug (`[a-z0-9_-]`). */
export function slugifySkillId(raw: string): string {
  const clean = raw
    .toLowerCase()
    .replace(/\.md$/i, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return clean.length >= 2 ? clean : `skill-${Date.now().toString(36)}`;
}

function parseFrontmatter(md: string): { meta: Record<string, string>; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(md.trimStart());
  if (!m) return { meta: {}, body: md };
  const meta: Record<string, string> = {};
  for (const line of (m[1] ?? '').split(/\r?\n/)) {
    const kv = /^([a-zA-Z0-9_-]+):\s*(.*)$/.exec(line.trim());
    if (!kv?.[1]) continue;
    const key = kv[1].toLowerCase().replace(/-/g, '_');
    const val = (kv[2] ?? '').trim().replace(/^["']|["']$/g, '');
    if (val) meta[key] = val;
  }
  return { meta, body: m[2] ?? '' };
}

function firstHeading(body: string): string | null {
  const m = /^#\s+(.+)$/m.exec(body);
  return m?.[1]?.replace(/[*_`#]/g, '').trim() ?? null;
}

function firstParagraph(body: string): string | null {
  const blocks = body
    .split(/\r?\n\s*\r?\n/)
    .map((b) => b.trim())
    .filter((b) => b && !b.startsWith('#') && !b.startsWith('```') && !b.startsWith('---'));
  const first = blocks[0];
  if (!first) return null;
  const clean = first
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_`>#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return clean.slice(0, 175) || null;
}

/**
 * Strips frontmatter, HTML comments, and fenced shell/python install commands so only
 * high-signal creative direction (style, pacing, typography, palette, motion rules) goes
 * into the AI director prompt within `USER_SKILL_INSTRUCTIONS_MAX`.
 */
export function condenseSkillInstructions(
  markdown: string,
  maxChars = USER_SKILL_INSTRUCTIONS_MAX,
): string {
  const { body } = parseFrontmatter(markdown);
  const cleaned = body
    .replace(/<!--[\s\S]*?-->/g, '')
    // Strip large fenced code blocks (install scripts / Python CLI commands) so creative rules fit
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (cleaned.length <= maxChars) return cleaned || markdown.trim().slice(0, maxChars);
  const cut = cleaned.slice(0, maxChars - 1);
  const lastBreak = Math.max(cut.lastIndexOf('\n'), cut.lastIndexOf('. '));
  return `${(lastBreak > maxChars * 0.6 ? cut.slice(0, lastBreak) : cut).trim()}…`;
}

/** Parses raw `SKILL.md` text (with optional YAML frontmatter) into editable `UserSkill` defaults. */
export function parseSkillMarkdown(
  raw: string,
  opts: { filename?: string; sourceUrl?: string } = {},
): ParsedSkillDraft {
  const markdown = raw.trim().slice(0, USER_SKILL_MAX_MD_CHARS);
  const { meta, body } = parseFrontmatter(markdown);

  const fallbackName = opts.filename
    ? opts.filename
        .replace(/\.md$/i, '')
        .replace(/[-_]+/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase())
    : 'Custom Skill';

  const name = (meta.name ?? meta.title ?? firstHeading(body) ?? fallbackName).trim().slice(0, 60);
  const blurb = (meta.blurb ?? meta.description ?? firstParagraph(body) ?? 'Custom Markdown skill')
    .trim()
    .slice(0, 180);

  const id = slugifySkillId(meta.id ?? name);

  const targetParsed = UserSkillTargetSchema.safeParse(meta.target);
  const baseRecipeParsed = BuiltInRecipeKeySchema.safeParse(meta.base_recipe ?? meta.recipe);
  const lookParsed = ReelLookSchema.safeParse(meta.look);
  const accentCandidate = meta.accent ?? meta.color;
  const accentParsed = accentCandidate ? SkillHexColorSchema.safeParse(accentCandidate) : null;
  const captionParsed = ReelCaptionStyleSchema.safeParse(meta.caption_style ?? meta.captions);
  const hookParsed = ReelHookStyleSchema.safeParse(meta.hook_style ?? meta.hook);
  const musicParsed = SkillMusicMoodSchema.safeParse(meta.music);

  return {
    id,
    name: name.length >= 2 ? name : 'Custom Skill',
    blurb,
    target: targetParsed.success ? targetParsed.data : 'both',
    baseRecipeId: baseRecipeParsed.success ? baseRecipeParsed.data : 'tech-explainer',
    look: lookParsed.success ? lookParsed.data : 'mono',
    accent: accentParsed?.success ? accentParsed.data : '#FF6A3D',
    captionStyle: captionParsed.success ? captionParsed.data : 'pop',
    hookStyle: hookParsed.success ? hookParsed.data : 'headline',
    music: musicParsed.success ? musicParsed.data : 'auto',
    markdown,
    ...(opts.sourceUrl ? { sourceUrl: opts.sourceUrl } : {}),
  };
}

/** Creates the bounded `UserSkillRef` snapshot stored inside `EditConfig`. */
export function toUserSkillRef(
  skill: Pick<UserSkill, 'id' | 'name' | 'target' | 'markdown'>,
): UserSkillRef {
  return UserSkillRefSchema.parse({
    id: skill.id,
    name: skill.name,
    target: skill.target,
    instructions: condenseSkillInstructions(skill.markdown, USER_SKILL_INSTRUCTIONS_MAX),
  });
}

const ALLOWED_GITHUB_HOSTS = new Set(['github.com', 'raw.githubusercontent.com']);

/**
 * Safely converts a GitHub repo or file URL into raw HTTPS markdown candidate URLs.
 * Rejects any non-GitHub or non-HTTPS URL to prevent SSRF.
 */
export function toRawGithubCandidates(rawUrl: string): string[] | null {
  let u: URL;
  try {
    u = new URL(rawUrl.trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || !ALLOWED_GITHUB_HOSTS.has(u.hostname.toLowerCase())) {
    return null;
  }
  if (u.hostname.toLowerCase() === 'raw.githubusercontent.com') {
    const segs = u.pathname.split('/').filter(Boolean);
    if (segs.length < 4) return null;
    return [`https://raw.githubusercontent.com/${segs.map(encodeURIComponent).join('/')}`];
  }

  // github.com
  const segs = u.pathname
    .replace(/\.git$/i, '')
    .split('/')
    .filter(Boolean);
  if (segs.length < 2) return null;
  const owner = encodeURIComponent(segs[0]!);
  const repo = encodeURIComponent(segs[1]!);

  // github.com/owner/repo/blob/branch/path/to/file.md
  if (segs[2] === 'blob' && segs.length >= 5) {
    const branch = encodeURIComponent(segs[3]!);
    const rest = segs.slice(4).map(encodeURIComponent).join('/');
    return [`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${rest}`];
  }

  // github.com/owner/repo/tree/branch/subdir
  if (segs[2] === 'tree' && segs.length >= 4) {
    const branch = encodeURIComponent(segs[3]!);
    const dir = segs.slice(4).map(encodeURIComponent).join('/');
    const prefix = dir ? `${dir}/` : '';
    return [
      `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${prefix}SKILL.md`,
      `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${prefix}README.md`,
    ];
  }

  // Repo root: try standard skill entry points across main / master
  return [
    `https://raw.githubusercontent.com/${owner}/${repo}/main/SKILL.md`,
    `https://raw.githubusercontent.com/${owner}/${repo}/master/SKILL.md`,
    `https://raw.githubusercontent.com/${owner}/${repo}/main/README.md`,
    `https://raw.githubusercontent.com/${owner}/${repo}/master/README.md`,
  ];
}

/** Original starter `SKILL.md` creators can load in one click inside the Import modal. */
export const EXAMPLE_SKILL_MARKDOWN = `---
name: Blueprint Schematic Documentary
blurb: Crisp architectural drafting lines, callout annotations, and disciplined camera rhythm.
target: both
look: mono
accent: "#2563EB"
caption_style: seam
hook_style: stat
music: minimal-tech
---

# Blueprint Schematic Documentary

## Visual Grammar
- Treat every beat like an architectural drafting plate: crisp 1.5 px ink hairlines, millimeter grid markings, numbered callouts, and measured dimension arrows.
- Keep layouts asymmetric and airy — one dominant hero diagram or oversized figure per beat, supported by at most one mono annotation label.
- Use cobalt blueprint blue (#2563EB) strictly for the single proof point or active vector; keep everything else neutral paper and charcoal ink.

## Pacing & Framing
- Cut cleanly on logical clauses (2.0–4.0 s per beat).
- Open with the key statistic or structural diagram immediately in the first 500 ms.
- Alternate between 50/50 split drafting plates and calm unobstructed speaker beats so complex ideas have room to land.

## Avoid
- Avoid neon gradients, floating 3D clutter, busy multi-chart dashboards, or decorative stock icons.
`;
