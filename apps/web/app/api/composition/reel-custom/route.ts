import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * The runtime of AI-written reel scenes (spec 30) for the editor preview: the same bundle the
 * export inlines into each custom scene's frame. Built by `pnpm --filter @motionpop/motion
 * build:runtime`. Plain JavaScript; the preview only ever runs it inside a sandboxed frame.
 */
export async function GET() {
  const dist = join(process.cwd(), '..', '..', 'packages', 'motion', 'dist');
  try {
    const js = await readFile(join(dist, 'reel-custom.js'), 'utf8');
    return new Response(js, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch {
    return new Response(
      'reel custom runtime not built: run pnpm --filter @motionpop/motion build:runtime',
      {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      },
    );
  }
}
