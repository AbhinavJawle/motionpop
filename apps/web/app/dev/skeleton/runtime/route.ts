import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

// Dev only: serves the bundled Motionpop runtime + the pinned HyperFrames runtime
// (built by `pnpm --filter @motionpop/motion build:runtime`).
export async function GET() {
  if (process.env.NODE_ENV === 'production') return new Response('Not found', { status: 404 });
  const dist = join(process.cwd(), '..', '..', 'packages', 'motion', 'dist');
  const [runtimeJs, hyperframesRuntimeJs] = await Promise.all([
    readFile(join(dist, 'runtime.js'), 'utf8'),
    readFile(join(dist, 'hyperframe.runtime.iife.js'), 'utf8'),
  ]);
  return Response.json({ runtimeJs, hyperframesRuntimeJs });
}
