import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RecipeIdSchema, ReelTemplateSchema, ReelThemeSchema } from '@motionpop/schemas';
import { describe, expect, it } from 'vitest';
import { RECIPES } from './recipes';
import { builtInSkills, styleFor } from './registry';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../../..');

/** Style pack ids, read from the JSON files in packages/motion/src/styles. */
const lookIds = new Set(
  readdirSync(join(root, 'packages/motion/src/styles'))
    .filter((f) => f.endsWith('.json'))
    .map(
      (f) =>
        (
          JSON.parse(readFileSync(join(root, 'packages/motion/src/styles', f), 'utf8')) as {
            id: string;
          }
        ).id,
    ),
);

const templateIds = new Set<string>(
  ReelTemplateSchema.options.map((o) => o.shape.template.value as string),
);

/** Minimal frontmatter reader: `key: value` lines between the `---` fences. */
function frontmatter(md: string): Record<string, string> {
  const block = /^---\n([\s\S]*?)\n---/.exec(md)?.[1] ?? '';
  const out: Record<string, string> = {};
  for (const line of block.split('\n')) {
    const m = /^([a-z_]+):\s*(.*)$/.exec(line);
    if (m?.[1] && m[2] !== undefined) out[m[1]] = m[2].trim();
  }
  return out;
}

/** `[a, b, c]` → ['a', 'b', 'c']. */
const list = (v: string | undefined): string[] =>
  (v ?? '')
    .replace(/^\[|\]$/g, '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

describe('recipe catalogue', () => {
  it('has the five recipes, ids unique, matching RecipeIdSchema minus custom', () => {
    const ids = RECIPES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(RecipeIdSchema.options.filter((o) => o !== 'custom').sort());
    expect(ids).toHaveLength(5);
  });

  for (const recipe of RECIPES) {
    describe(recipe.id, () => {
      it('has 2–3 styles with unique ids', () => {
        expect(recipe.styles.length).toBeGreaterThanOrEqual(2);
        expect(recipe.styles.length).toBeLessThanOrEqual(3);
        expect(new Set(recipe.styles.map((s) => s.id)).size).toBe(recipe.styles.length);
      });

      it('has a layout mix that sums to 1 and a valid scene range', () => {
        const sum = Object.values(recipe.layoutMix).reduce((a, b) => a + b, 0);
        expect(Math.abs(sum - 1)).toBeLessThanOrEqual(0.01);
        expect(recipe.sceneMs.min).toBeLessThan(recipe.sceneMs.max);
      });

      it('prefers only real reel templates', () => {
        for (const t of recipe.preferredTemplates) expect(templateIds.has(t)).toBe(true);
      });

      it('has valid themes', () => {
        for (const s of recipe.styles) {
          if (s.theme) expect(ReelThemeSchema.safeParse(s.theme).success).toBe(true);
        }
      });

      it('names an existing voiceover look', () => {
        expect(lookIds.has(recipe.defaults.voiceoverLook)).toBe(true);
      });

      it('matches skills/recipes/<id>.md', () => {
        const md = readFileSync(join(root, 'skills/recipes', `${recipe.id}.md`), 'utf8');
        const fm = frontmatter(md);
        expect(fm.id).toBe(recipe.id);
        expect(fm.name).toBe(recipe.name);
        expect(fm.kind).toBe('recipe');
        expect(fm.version).toBe('1');
        expect(list(fm.styles)).toEqual(recipe.styles.map((s) => s.id));
        expect(list(fm.scene_ms).map(Number)).toEqual([recipe.sceneMs.min, recipe.sceneMs.max]);
        expect(fm.default_look).toBe(recipe.styles[0]?.look);
      });
    });
  }
});

describe('builtInSkills', () => {
  it('looks recipes and styles up', () => {
    expect(builtInSkills.recipes()).toBe(RECIPES);
    expect(builtInSkills.recipe('gaming')?.name).toBe('Gaming');
    expect(builtInSkills.recipe('custom')).toBeUndefined();
    expect(builtInSkills.style('gaming', 'clean-hud')?.name).toBe('Clean HUD');
    expect(builtInSkills.style('gaming', 'nope')).toBeUndefined();
  });

  it('delegates slot skills to the catalogue', () => {
    expect(builtInSkills.slotSkill('calm-explanation')?.id).toBe('calm-explanation');
    expect(builtInSkills.slotSkill('nope')).toBeUndefined();
  });
});

describe('styleFor', () => {
  it('returns the named style', () => {
    expect(styleFor('hot-take', 'flame-punch').id).toBe('flame-punch');
  });

  it('falls back to the recipe’s first style for an unknown style id', () => {
    expect(styleFor('finance-business', 'nope').id).toBe('newsprint-ink');
  });

  it('uses the Tech Explainer’s first style for custom', () => {
    expect(styleFor('custom', 'whatever').id).toBe('mono-grid');
    expect(styleFor('custom', 'warm-editorial').id).toBe('warm-editorial');
  });
});
