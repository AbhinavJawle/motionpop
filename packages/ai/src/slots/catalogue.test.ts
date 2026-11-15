import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { components } from '@motionpop/motion';
import { describe, expect, it } from 'vitest';
import { CATALOGUE, SKILLS, catalogueEntry, componentLimits, skillEntry } from './catalogue';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../../..');

/** Minimal frontmatter reader for the fields we mirror (id, use_when, works_with, default_duration). */
function frontmatter(md: string): Record<string, string> {
  const block = /^---\n([\s\S]*?)\n---/.exec(md)?.[1] ?? '';
  const out: Record<string, string> = {};
  for (const line of block.split('\n')) {
    const m = /^([a-z_]+):\s*(.*)$/.exec(line);
    if (m?.[1] && m[2] !== undefined) out[m[1]] = m[2].trim();
  }
  return out;
}

const skillFiles = readdirSync(join(root, 'skills')).filter((f) => f.endsWith('.md'));

describe('component catalogue', () => {
  it('lists exactly the components in component-library.md, in build order', () => {
    const md = readFileSync(join(root, '.kiro/steering/component-library.md'), 'utf8');
    const ids = [...md.matchAll(/^## \d+\. `([a-z-]+)`/gm)].map((m) => m[1]);
    expect(CATALOGUE.map((c) => c.id)).toEqual(ids);
  });

  it('copies each "Use when" line from component-library.md', () => {
    const md = readFileSync(join(root, '.kiro/steering/component-library.md'), 'utf8');
    for (const c of CATALOGUE) {
      const section = md.split(`\`${c.id}\``)[1] ?? '';
      const useWhen = /\*\*Use when:\*\* (.+?)\.?\n/.exec(section)?.[1];
      expect(useWhen, c.id).toBe(c.useWhen);
    }
  });

  it('marks built exactly the components in the motion registry, with matching durations', () => {
    const registry = components as Record<
      string,
      { durationMs: { min: number; ideal: number; max: number } }
    >;
    expect(
      CATALOGUE.filter((c) => c.built)
        .map((c) => c.id)
        .sort(),
    ).toEqual(Object.keys(registry).sort());
    for (const c of CATALOGUE.filter((e) => e.built)) {
      const d = registry[c.id]?.durationMs;
      expect({ min: c.minMs, ideal: c.idealMs, max: c.maxMs }, c.id).toEqual(d);
    }
  });

  it('has sane duration limits', () => {
    for (const c of CATALOGUE) {
      expect(c.minMs, c.id).toBeGreaterThan(0);
      expect(c.minMs, c.id).toBeLessThanOrEqual(c.idealMs);
      expect(c.idealMs, c.id).toBeLessThanOrEqual(c.maxMs);
    }
  });

  it('looks entries up by id', () => {
    expect(catalogueEntry('big-number')?.built).toBe(true);
    expect(componentLimits('big-number')).toEqual({ minMs: 2600, idealMs: 3600, maxMs: 8000 });
    expect(componentLimits('nope')).toBeNull();
  });
});

describe('skill catalogue', () => {
  it('mirrors every skills/*.md file', () => {
    expect(SKILLS.map((s) => s.id).sort()).toEqual(
      skillFiles.map((f) => f.replace(/\.md$/, '')).sort(),
    );
  });

  it.each(skillFiles)('matches the frontmatter of %s', (file) => {
    const fm = frontmatter(readFileSync(join(root, 'skills', file), 'utf8'));
    const skill = skillEntry(fm.id ?? '');
    expect(skill, file).toBeDefined();
    expect(skill?.useWhen).toBe(fm.use_when);
    expect(skill?.worksWith).toEqual(
      (fm.works_with ?? '')
        .replace(/[[\]]/g, '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    );
    expect(skill?.defaultDurationMs).toBe(Number(fm.default_duration) * 1000);
  });

  it('only works with components in the catalogue', () => {
    for (const s of SKILLS)
      for (const id of s.worksWith) expect(catalogueEntry(id), `${s.id} → ${id}`).toBeDefined();
  });
});
