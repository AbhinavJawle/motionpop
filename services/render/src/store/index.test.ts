import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// `@motionpop/render/store` is imported by the web server's routes. It must never reach the
// producer, Chrome or ffmpeg code (spec 08 design §4): those would end up in the Next.js bundle.
const FORBIDDEN = [/^puppeteer/, /^@hyperframes\//, /^@motionpop\/motion/, /child_process/];
const FORBIDDEN_FILES = [/producer\.ts$/, /preflight\.ts$/, /ffmpeg\.ts$/, /run-render\.ts$/];

function resolveRelative(from: string, spec: string): string | null {
  const base = resolve(dirname(from), spec);
  for (const c of [base, `${base}.ts`, `${base}/index.ts`])
    if (existsSync(c) && c.endsWith('.ts')) return c;
  return null;
}

/** Every module specifier reachable from `entry` through relative imports, with its importer. */
function graph(entry: string): { file: string; spec: string }[] {
  const seen = new Set<string>();
  const out: { file: string; spec: string }[] = [];
  const visit = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    const src = readFileSync(file, 'utf8');
    const re =
      /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|import\s*['"]([^'"]+)['"]/g;
    for (const m of src.matchAll(re)) {
      const spec = m[1] ?? m[2] ?? m[3] ?? '';
      out.push({ file, spec });
      if (spec.startsWith('.')) {
        const next = resolveRelative(file, spec);
        if (next) visit(next);
      }
    }
  };
  visit(entry);
  out.push(...[...seen].map((f) => ({ file: f, spec: f })));
  return out;
}

describe('@motionpop/render/store import graph', () => {
  const entry = resolve(import.meta.dirname, 'index.ts');
  const edges = graph(entry);

  it('is not empty (the scanner finds the ledger)', () => {
    const files = edges.filter((e) => e.file === e.spec).map((e) => e.file);
    expect(files.some((f) => f.endsWith('ledger.ts'))).toBe(true);
    expect(files.some((f) => f.endsWith('ledger-logic.ts'))).toBe(true);
    expect(edges.some((e) => e.spec === 'firebase-admin/firestore')).toBe(true);
  });

  it('never imports the producer, puppeteer, ffmpeg, the motion package or child_process', () => {
    const bad = edges.filter(
      (e) =>
        (e.file !== e.spec && FORBIDDEN.some((re) => re.test(e.spec))) ||
        (e.file === e.spec && FORBIDDEN_FILES.some((re) => re.test(e.file))),
    );
    expect(bad).toEqual([]);
  });
});
