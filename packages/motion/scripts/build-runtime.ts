// Bundles src/runtime/runtime.ts into dist/runtime.js (IIFE) and copies the pinned
// HyperFrames runtime next to it. Usage: node scripts/build-runtime.ts
import { build } from 'esbuild';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(pkgDir, 'dist');
await mkdir(outDir, { recursive: true });

await build({
  entryPoints: [join(pkgDir, 'src/runtime/runtime.ts')],
  outfile: join(outDir, 'runtime.js'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'chrome120',
  minify: true,
  legalComments: 'none',
});

const require = createRequire(import.meta.url);
const corePkg = require.resolve('@hyperframes/core/package.json');
await copyFile(
  join(dirname(corePkg), 'dist/hyperframe.runtime.iife.js'),
  join(outDir, 'hyperframe.runtime.iife.js'),
);
// Fonts as base64 for the compiler's @font-face rules (family → woff2 base64).
const fontDir = join(pkgDir, 'src/fonts');
const fonts = {
  Geist: (await readFile(join(fontDir, 'Geist-Variable.woff2'))).toString('base64'),
  'Geist Mono': (await readFile(join(fontDir, 'GeistMono-Variable.woff2'))).toString('base64'),
};
await writeFile(join(outDir, 'fonts.json'), JSON.stringify(fonts));
console.log(`runtime built → ${outDir}`);
