// The runtime bundle, fonts and textures the compiler inlines: packages/motion/dist, built by
// `pnpm --filter @motionpop/motion build:runtime`.
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { CompileAssets } from './ports';

let cached: Promise<CompileAssets> | undefined;

export function motionDistDir(): string {
  const require = createRequire(import.meta.url);
  return join(dirname(require.resolve('@motionpop/motion/package.json')), 'dist');
}

export function loadCompileAssets(distDir: string = motionDistDir()): Promise<CompileAssets> {
  cached ??= (async () => {
    try {
      const [runtimeJs, hyperframesRuntimeJs, fontsJson, texturesJson] = await Promise.all(
        ['runtime.js', 'hyperframe.runtime.iife.js', 'fonts.json', 'textures.json'].map((f) =>
          readFile(join(distDir, f), 'utf8'),
        ),
      );
      return {
        runtimeJs: runtimeJs!,
        hyperframesRuntimeJs: hyperframesRuntimeJs!,
        fonts: JSON.parse(fontsJson!) as Record<string, string>,
        textures: JSON.parse(texturesJson!) as { grain: string; paper: string },
      };
    } catch (e) {
      cached = undefined; // retry next time, for example after the runtime was built
      throw new Error(
        `motion runtime not built in ${distDir} (run pnpm --filter @motionpop/motion build:runtime): ${String(e)}`,
      );
    }
  })();
  return cached;
}
