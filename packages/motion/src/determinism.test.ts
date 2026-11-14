import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const srcDir = dirname(fileURLToPath(import.meta.url));
const componentsDir = join(srcDir, 'components');

function listSources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listSources(path);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [path] : [];
  });
}

// Colours come from the style pack tokens, never literals in component code.
const COLOUR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\brgba?\(/;

export function findColourLiterals(files: string[]): string[] {
  const hits: string[] = [];
  for (const file of files) {
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        if (COLOUR_LITERAL.test(line)) {
          hits.push(`${relative(srcDir, file)}:${i + 1}: ${line.trim()}`);
        }
      });
  }
  return hits;
}

describe('component colour literals', () => {
  it('scans at least one component source file', () => {
    expect(listSources(componentsDir).length).toBeGreaterThan(0);
  });

  it('finds literals when present (detector self-check)', () => {
    expect(COLOUR_LITERAL.test('const c = "#fff";')).toBe(true);
    expect(COLOUR_LITERAL.test('fill: rgba(0,0,0,.5)')).toBe(true);
    expect(COLOUR_LITERAL.test('const c = tokens.ink;')).toBe(false);
  });

  it('has no #hex or rgb()/rgba() literals in non-test component files', () => {
    expect(findColourLiterals(listSources(componentsDir))).toEqual([]);
  });
});
