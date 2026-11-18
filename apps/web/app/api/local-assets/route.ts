import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { NextResponse } from 'next/server';
import {
  EXT_BY_MIME,
  LOCAL_ASSETS_DIR,
  LOCAL_ASSETS_MAX_BYTES,
  localAssetsEnabled,
} from '@/lib/studio/local-assets.server';

/** POST raw bytes → `{ url, key }`, content-addressed (development only). */
export async function POST(req: Request) {
  if (!localAssetsEnabled()) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const type = (req.headers.get('content-type') ?? '').split(';')[0]!.trim();
  const ext = EXT_BY_MIME[type];
  if (!ext) return NextResponse.json({ error: 'unsupported_type' }, { status: 415 });
  const bytes = Buffer.from(await req.arrayBuffer());
  if (bytes.length === 0 || bytes.length > LOCAL_ASSETS_MAX_BYTES)
    return NextResponse.json({ error: 'bad_size' }, { status: 413 });
  const key = `${createHash('sha256').update(bytes).digest('hex')}.${ext}`;
  await mkdir(LOCAL_ASSETS_DIR, { recursive: true });
  await writeFile(join(LOCAL_ASSETS_DIR, key), bytes);
  return NextResponse.json({ url: `/local-assets/${key}`, key });
}
