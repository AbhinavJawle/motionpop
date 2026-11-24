import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { pairedSlotSkillsFor, parseShotSequence, reelDirectorSkills, slotSkills } from './catalog';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../../..');

function frontmatter(md: string): Record<string, string> {
  const block = /^---\n([\s\S]*?)\n---/.exec(md)?.[1] ?? '';
  const out: Record<string, string> = {};
  for (const line of block.split('\n')) {
    const m = /^([a-z_]+):\s*(.*)$/.exec(line);
    if (m?.[1] && m[2] !== undefined) out[m[1]] = m[2].trim();
  }
  return out;
}

describe('skills catalog parity with skills/*.md and skills/recipes/*.md', () => {
  it('lists every markdown slot skill in skills/*.md with matching metadata', () => {
    const mdFiles = readdirSync(join(root, 'skills'))
      .filter((f) => f.endsWith('.md'))
      .sort();
    const items = slotSkills();
    expect(items.map((s) => `${s.id}.md`).sort()).toEqual(mdFiles);

    for (const sk of items) {
      const md = readFileSync(join(root, sk.filePath), 'utf8');
      const fm = frontmatter(md);
      expect(sk.id).toBe(fm.id);
      expect(sk.name).toBe(fm.name);
      expect(sk.energy).toBe(fm.energy);
      expect(sk.defaultDurationMs).toBe(Number(fm.default_duration) * 1000);
      expect(sk.shots.length).toBeGreaterThanOrEqual(3);
      expect(sk.scenes.length).toBeGreaterThan(0);
    }
  });

  it('lists every recipe skill in skills/recipes/*.md and pairs only valid slot skills', () => {
    const mdFiles = readdirSync(join(root, 'skills/recipes'))
      .filter((f) => f.endsWith('.md'))
      .sort();
    const recipes = reelDirectorSkills();
    expect(recipes.map((r) => `${r.id}.md`).sort()).toEqual(mdFiles);

    const validSlotIds = new Set(slotSkills().map((s) => s.id));
    for (const r of recipes) {
      const paired = pairedSlotSkillsFor(r.id);
      expect(paired.length).toBeGreaterThan(0);
      for (const sk of paired) expect(validSlotIds.has(sk.id)).toBe(true);
    }
  });

  it('parses percentage shot sequences cleanly', () => {
    const segs = parseShotSequence(
      '- 0–15%: eyebrow enters\n- 15–80%: line draws\n- 80–100%: hold',
    );
    expect(segs).toEqual([
      { startPct: 0, endPct: 15, rangeLabel: '0–15%', action: 'eyebrow enters' },
      { startPct: 15, endPct: 80, rangeLabel: '15–80%', action: 'line draws' },
      { startPct: 80, endPct: 100, rangeLabel: '80–100%', action: 'hold' },
    ]);
  });
});
