import { reelFontCss } from '@motionpop/motion/reel';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * The reel engine's @font-face rules (spec 25) for the editor preview: the same bundled OFL
 * fonts the export inlines, as one stylesheet. Built by `pnpm --filter @motionpop/motion
 * build:runtime`.
 */
export async function GET() {
  const dist = join(process.cwd(), '..', '..', 'packages', 'motion', 'dist');
  try {
    const fonts = JSON.parse(await readFile(join(dist, 'reel-fonts.json'), 'utf8')) as Record<
      string,
      string
    >;
    return new Response(reelFontCss(fonts), {
      headers: {
        'Content-Type': 'text/css; charset=utf-8',
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch {
    return new Response(
      '/* reel fonts not built: run pnpm --filter @motionpop/motion build:runtime */',
      {
        status: 503,
        headers: { 'Content-Type': 'text/css; charset=utf-8' },
      },
    );
  }
}
