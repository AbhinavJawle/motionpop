// The runtime bundle, fonts and textures the compiler inlines: packages/motion/dist, built by
// `pnpm --filter @motionpop/motion build:runtime`.
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join } from 'node:path';
import type { ReelCompileAssets } from '@motionpop/motion/reel';
import type { CompileAssets } from './ports';

let cached: Promise<CompileAssets> | undefined;

/**
 * Where the built runtime is. `MOTION_DIST_DIR` wins. Otherwise the package is resolved from this
 * file; a bundler (Next's dev server) rewrites that path to a virtual "[project]/…" one that
 * does not exist on disk, so the well-known workspace locations are tried next (found by the
 * offline export e2e of spec 08 task 19).
 */
export function motionDistDir(
  env: Readonly<Record<string, string | undefined>> = process.env,
  cwd: string = process.cwd(),
): string {
  const override = env['MOTION_DIST_DIR'];
  if (override) return override;
  const require = createRequire(import.meta.url);
  const resolved = join(dirname(require.resolve('@motionpop/motion/package.json')), 'dist');
  if (isAbsolute(resolved) && existsSync(resolved)) return resolved;
  for (const candidate of [
    join(cwd, '..', '..', 'packages', 'motion', 'dist'), // apps/web
    join(cwd, 'packages', 'motion', 'dist'), // the repository root
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  return resolved;
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

let reelCached: Promise<ReelCompileAssets> | undefined;

/** The reel engine's runtime, the HyperFrames runtime and the reel fonts (spec 25). */
export function loadReelAssets(distDir: string = motionDistDir()): Promise<ReelCompileAssets> {
  reelCached ??= (async () => {
    try {
      const [reelRuntimeJs, hyperframesRuntimeJs, fontsJson] = await Promise.all(
        ['reel-runtime.js', 'hyperframe.runtime.iife.js', 'reel-fonts.json'].map((f) =>
          readFile(join(distDir, f), 'utf8'),
        ),
      );
      return {
        reelRuntimeJs: reelRuntimeJs!,
        hyperframesRuntimeJs: hyperframesRuntimeJs!,
        fonts: JSON.parse(fontsJson!) as Record<string, string>,
      };
    } catch (e) {
      reelCached = undefined;
      throw new Error(
        `reel runtime not built in ${distDir} (run pnpm --filter @motionpop/motion build:runtime): ${String(e)}`,
      );
    }
  })();
  return reelCached;
}
