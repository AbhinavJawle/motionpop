// Bundles one film-lab entry (scripts/film-lab/<name>.ts) into .check/film-lab/ and runs it.
// Usage: node scripts/run-film-lab.ts <entry> [args]   e.g. node scripts/run-film-lab.ts run --setup s1
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const entry = process.argv[2] ?? 'run';
const out = join(pkgDir, '.check', 'film-lab', `${entry}.mjs`);
await mkdir(dirname(out), { recursive: true });
await build({
  entryPoints: [join(pkgDir, 'scripts/film-lab', `${entry}.ts`)],
  outfile: out,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  external: ['puppeteer'],
  logLevel: 'warning',
});
const r = spawnSync(process.execPath, [out, ...process.argv.slice(3)], {
  stdio: 'inherit',
  cwd: pkgDir,
  env: { ...process.env, MOTION_PKG_DIR: pkgDir },
});
process.exit(r.status ?? 1);
