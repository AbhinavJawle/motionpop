// Bundles scripts/reel.ts (extensionless src/ imports) into .check/reel.mjs and runs it.
// Usage: node scripts/run-reel.ts <words.json> [--look id] [--format 16:9] [--every 600]
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(pkgDir, '.check', 'reel.mjs');
await mkdir(dirname(out), { recursive: true });
await build({
  entryPoints: [join(pkgDir, 'scripts/reel.ts')],
  outfile: out,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  external: ['puppeteer', 'zod', 'happy-dom'],
  logLevel: 'warning',
});
const r = spawnSync(process.execPath, [out, ...process.argv.slice(2)], {
  stdio: 'inherit',
  cwd: pkgDir,
  env: { ...process.env, MOTION_PKG_DIR: pkgDir },
});
process.exit(r.status ?? 1);
