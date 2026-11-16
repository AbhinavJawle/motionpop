// Bundles scripts/sheet.ts (extensionless src/ imports) into .check/sheet.mjs and runs it.
// Usage: node scripts/run-sheet.ts <scene-id> [--looks a,b] [--times 0.1,0.5] [--content JSON]
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(pkgDir, '.check', 'sheet.mjs');
await mkdir(dirname(out), { recursive: true });
await build({
  entryPoints: [join(pkgDir, 'scripts/sheet.ts')],
  outfile: out,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  external: ['puppeteer', 'zod'],
  logLevel: 'warning',
});
const r = spawnSync(process.execPath, [out, ...process.argv.slice(2)], {
  stdio: 'inherit',
  cwd: pkgDir,
  env: { ...process.env, MOTION_PKG_DIR: pkgDir },
});
process.exit(r.status ?? 1);
