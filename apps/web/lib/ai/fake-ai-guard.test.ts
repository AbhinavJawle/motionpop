import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * P9 (spec 09 task 11). `NEXT_PUBLIC_*` values are inlined at build time, so the runtime guard in
 * `routerKind` is not enough: nothing that builds or runs the hosted app may set the flag. Only
 * the Playwright config sets it, for its own dev server. Scanned: App Hosting config, committed
 * `.env*` files (not `*.local`, which git ignores), the CI workflows, every `package.json`
 * script and the Dockerfiles.
 */
const ROOT = fileURLToPath(new URL('../../../..', import.meta.url));
const FLAG = 'NEXT_PUBLIC_FAKE_AI';
const SKIP = new Set(['node_modules', '.next', '.git', '.turbo', 'dist', 'e2e-output', '.check']);

function* walk(dir: string, depth = 0): Generator<string> {
  if (depth > 4) return;
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name) || name.startsWith('.next')) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) yield* walk(full, depth + 1);
    else yield full;
  }
}

const rel = (p: string) => p.slice(ROOT.length);
const files = [...walk(ROOT)];

const isConfig = (p: string) => {
  const name = p.split('/').at(-1) ?? '';
  if (/^\.env(\..+)?$/.test(name)) return !name.endsWith('.local');
  if (name === 'apphosting.yaml' || /^apphosting\..+\.yaml$/.test(name)) return true;
  if (name === 'Dockerfile' || name.startsWith('Dockerfile.')) return true;
  if (name === 'package.json') return true;
  return rel(p).startsWith('.github/workflows/') && /\.ya?ml$/.test(name);
};

describe('P9 no committed config sets NEXT_PUBLIC_FAKE_AI', () => {
  const configs = files.filter(isConfig);

  it('finds the files it is meant to scan', () => {
    const names = configs.map(rel);
    expect(names).toContain('apps/web/apphosting.yaml');
    expect(names).toContain('.env.example');
    expect(names).toContain('.github/workflows/ci.yml');
    expect(names).toContain('apps/web/package.json');
  });

  it.each(configs.map((p) => [rel(p), p] as const))('%s', (_name, path) => {
    expect(readFileSync(path, 'utf8')).not.toContain(FLAG);
  });
});
