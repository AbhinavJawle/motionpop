import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const UI_DIR = fileURLToPath(new URL('.', import.meta.url));

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return tsxFiles(full);
    return full.endsWith('.tsx') ? [full] : [];
  });
}

/** Removes block and line comments (design notes may cite hex values from the CSS). */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

const HEX = /#[0-9a-fA-F]{3,8}\b/g;

describe('components/ui use tokens only (R1.2)', () => {
  const files = tsxFiles(UI_DIR);

  it('finds the ui components', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('strips comments but keeps code', () => {
    expect(stripComments('/* #fff */ const a = 1; // #000\n')).not.toMatch(HEX);
    expect(stripComments('const c = "#abc";')).toMatch(HEX);
  });

  for (const file of files) {
    it(`${file.slice(UI_DIR.length)} has no raw hex colours`, () => {
      const code = stripComments(readFileSync(file, 'utf8'));
      expect(code.match(HEX) ?? []).toEqual([]);
    });
  }
});
