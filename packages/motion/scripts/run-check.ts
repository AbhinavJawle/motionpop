// Bundles scripts/check.ts (which imports src/ with extensionless imports Node can't resolve)
// into .check/check.mjs and runs it. Usage: node scripts/run-check.ts <id> [--samples N] [--seed S]
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(pkgDir, '.check', 'check.mjs');
await mkdir(dirname(out), { recursive: true });
await build({
  entryPoints: [join(pkgDir, 'scripts/check.ts')],
  outfile: out,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  external: ['puppeteer', 'fast-check', 'zod'],
  logLevel: 'warning',
});
const r = spawnSync(process.execPath, [out, ...process.argv.slice(2)], {
  stdio: 'inherit',
  cwd: pkgDir,
  env: { ...process.env, MOTION_PKG_DIR: pkgDir },
});
process.exit(r.status ?? 1);
