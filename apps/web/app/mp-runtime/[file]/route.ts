import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Our engine for studio graphic blocks (spec 17 R4), built by
 * `pnpm --filter @motionpop/motion build:runtime`. The studio page and every composition document
 * the studio assembles load it from here.
 */
const FILES: Record<string, string> = { 'block-runtime.js': 'text/javascript; charset=utf-8' };

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const type = FILES[file];
  if (!type) return new Response('Not found', { status: 404 });
  const dist = join(process.cwd(), '..', '..', 'packages', 'motion', 'dist');
  const body = await readFile(join(dist, file), 'utf8').catch(() => null);
  if (body === null) return new Response('Runtime not built', { status: 503 });
  return new Response(body, { headers: { 'content-type': type, 'cache-control': 'public, max-age=300' } });
}
