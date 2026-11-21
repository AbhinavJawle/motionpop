// Bundles src/runtime/runtime.ts into dist/runtime.js (IIFE) and copies the pinned
// HyperFrames runtime next to it. Usage: node scripts/build-runtime.ts
import { build } from 'esbuild';
import { copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUNDLED_FONTS } from '../src/fonts/font-faces.ts';
import { textureDataUrls } from './textures.ts';

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

// Reel engine (spec 25): its own runtime bundle and fonts.
await build({
  entryPoints: [join(pkgDir, 'src/reel/hf-entry.ts')],
  outfile: join(outDir, 'reel-runtime.js'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'chrome120',
  minify: true,
  legalComments: 'none',
});
const reelFontDir = join(pkgDir, 'src/reel/fonts');
const reelFonts: Record<string, string> = {
  Inter: (await readFile(join(reelFontDir, 'Inter-Variable.woff2'))).toString('base64'),
  Newsreader: (await readFile(join(reelFontDir, 'Newsreader-Variable.woff2'))).toString('base64'),
  'Playfair Display Italic': (
    await readFile(join(reelFontDir, 'PlayfairDisplay-Italic-Variable.woff2'))
  ).toString('base64'),
  'Geist Mono': (await readFile(join(pkgDir, 'src/fonts/GeistMono-Variable.woff2'))).toString('base64'),
};
await writeFile(join(outDir, 'reel-fonts.json'), JSON.stringify(reelFonts));

const require = createRequire(import.meta.url);
const corePkg = require.resolve('@hyperframes/core/package.json');
await copyFile(
  join(dirname(corePkg), 'dist/hyperframe.runtime.iife.js'),
  join(outDir, 'hyperframe.runtime.iife.js'),
);
// Fonts as base64 for the compiler's @font-face rules (family → woff2 base64).
const fontDir = join(pkgDir, 'src/fonts');
const fonts: Record<string, string> = {};
for (const [family, file] of Object.entries(BUNDLED_FONTS)) {
  fonts[family] = (await readFile(join(fontDir, file))).toString('base64');
}
await writeFile(join(outDir, 'fonts.json'), JSON.stringify(fonts));
// Seeded grain + paper tiles as PNG data URLs (see scripts/textures.ts).
await writeFile(join(outDir, 'textures.json'), JSON.stringify(textureDataUrls()));
// Map imagery for the globe (public domain; see docs/third-party.md), served to the preview and
// copied next to the composition by the render job.
await mkdir(join(outDir, 'maps'), { recursive: true });
for (const f of await readdir(join(pkgDir, 'assets/maps'))) {
  if (f.endsWith('.webp')) await copyFile(join(pkgDir, 'assets/maps', f), join(outDir, 'maps', f));
}
console.log(`runtime built → ${outDir}`);
