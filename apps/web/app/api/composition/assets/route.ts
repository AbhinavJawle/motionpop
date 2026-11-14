import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Serves the compiled composition assets (our runtime, the pinned HyperFrames runtime, the
 * bundled fonts and texture tiles) that `compileProject` inlines into the preview. Built by
 * `pnpm --filter @motionpop/motion build:runtime`. Packaging `dist/` for App Hosting is part of
 * spec 08; locally the files are read from the workspace.
 */
export async function GET() {
  const dist = join(process.cwd(), '..', '..', 'packages', 'motion', 'dist');
  try {
    const [runtimeJs, hyperframesRuntimeJs, fontsJson, texturesJson] = await Promise.all([
      readFile(join(dist, 'runtime.js'), 'utf8'),
      readFile(join(dist, 'hyperframe.runtime.iife.js'), 'utf8'),
      readFile(join(dist, 'fonts.json'), 'utf8'),
      readFile(join(dist, 'textures.json'), 'utf8'),
    ]);
    return Response.json(
      {
        runtimeJs,
        hyperframesRuntimeJs,
        fonts: JSON.parse(fontsJson) as unknown,
        textures: JSON.parse(texturesJson) as unknown,
      },
      { headers: { 'Cache-Control': 'private, max-age=300' } },
    );
  } catch {
    return Response.json(
      { error: 'Composition runtime not built. Run pnpm --filter @motionpop/motion build:runtime.' },
      { status: 503 },
    );
  }
}
