import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { components, scenes } from '@motionpop/motion';
import { describe, expect, it } from 'vitest';
import {
  CATALOGUE,
  DETECT_CATALOGUE,
  SCENES,
  SKILLS,
  catalogueEntry,
  componentLimits,
  detectWorksWith,
  isDetectable,
  sceneEntry,
  skillEntry,
  skillWorksWith,
} from './catalogue';

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
    ).toEqual(
      // `custom` (spec 15) is only made on request, never suggested, so it has no catalogue entry.
      Object.keys(registry)
        .filter((id) => id !== 'custom')
        .sort(),
    );
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

describe('scene catalogue (spec 07 task 27)', () => {
  const registry = scenes as unknown as Record<
    string,
    { name: string; useWhen: string; durationMs: { min: number; ideal: number; max: number } }
  >;

  it('mirrors the motion scenes registry: ids, names, "use when" lines and durations', () => {
    expect(SCENES.map((s) => s.id).sort()).toEqual(Object.keys(registry).sort());
    for (const s of SCENES) {
      const r = registry[s.id];
      expect({ name: s.name, useWhen: s.useWhen }, s.id).toEqual({
        name: r?.name,
        useWhen: r?.useWhen,
      });
      expect({ min: s.minMs, ideal: s.idealMs, max: s.maxMs }, s.id).toEqual(r?.durationMs);
      expect(s.built).toBe(true);
    }
  });

  it('replaces only catalogue components, which detection then stops offering', () => {
    for (const s of SCENES)
      for (const r of s.replaces) {
        expect(catalogueEntry(r), `${s.id} replaces ${r}`).toBeDefined();
        expect(isDetectable(r)).toBe(false);
      }
    expect(DETECT_CATALOGUE.slice(0, SCENES.length)).toEqual(SCENES);
    expect(new Set(DETECT_CATALOGUE.map((c) => c.id)).size).toBe(DETECT_CATALOGUE.length);
    // Legacy ids still resolve, so saved projects keep their limits.
    expect(componentLimits('big-number')).toEqual({ minMs: 2600, idealMs: 3600, maxMs: 8000 });
    expect(componentLimits('stat-punch')).toEqual({ minMs: 2600, idealMs: 4600, maxMs: 8000 });
  });

  it('lets a skill that works with a replaced component work with its scene', () => {
    const stat = skillEntry('shocking-stat-reveal');
    const trend = skillEntry('slow-build-trend');
    expect(stat && skillWorksWith(stat, 'stat-punch')).toBe(true);
    expect(stat && skillWorksWith(stat, 'hook-statement')).toBe(true);
    expect(trend && skillWorksWith(trend, 'stat-punch')).toBe(false);
    expect(stat && detectWorksWith(stat)).toEqual(['stat-punch', 'hook-statement']);
    expect(sceneEntry('big-number')).toBeUndefined();
  });

  it('pairs every scene with at least one skill', () => {
    for (const s of SCENES)
      expect(
        SKILLS.some((k) => skillWorksWith(k, s.id)),
        s.id,
      ).toBe(true);
  });
});
