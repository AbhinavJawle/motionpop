import { parseSkillMarkdown, toRawGithubCandidates } from '@motionpop/ai';
import { USER_SKILL_MAX_MD_CHARS } from '@motionpop/schemas';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { errorResponse, verifyRequest } from '@/lib/firebase/verify.server';
import { readResponseBytesWithLimit } from '@/lib/media/stock.server';
import { renderMode } from '@/lib/renders/mode.server';
import { readBodyText } from '@/lib/renders/route-support.server';

/**
 * SSRF-safe Markdown skill importer (Spec 43).
 * Accepts ONLY `https://github.com/...` or `https://raw.githubusercontent.com/...` URLs,
 * resolves repo/blob/tree URLs to raw Markdown candidates, caps size to 128 KB, and returns
 * the parsed skill draft so the creator can review/save it into their Firestore/local registry.
 */

const ImportRequestSchema = z.object({
  url: z.string().trim().url().max(300),
});

const MAX_BYTES = 128 * 1024;
const MAX_REQ_BYTES = 4096;
const TIMEOUT_MS = 8000;

export async function POST(req: Request) {
  if (renderMode() !== 'offline') {
    try {
      await verifyRequest(req);
    } catch (err) {
      return errorResponse(err);
    }
  }
  const bodyRead = await readBodyText(req, MAX_REQ_BYTES);
  if ('tooLarge' in bodyRead) {
    return NextResponse.json({ error: 'Request too large.' }, { status: 413 });
  }
  let rawBody: unknown;
  try {
    rawBody = JSON.parse(bodyRead.text);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request body.' }, { status: 400 });
  }
  const parsed = ImportRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter a valid GitHub URL.' }, { status: 400 });
  }

  const candidates = toRawGithubCandidates(parsed.data.url);
  if (!candidates || candidates.length === 0) {
    return NextResponse.json(
      { error: 'Only HTTPS github.com and raw.githubusercontent.com URLs are supported.' },
      { status: 400 },
    );
  }

  for (const candidate of candidates) {
    try {
      const res = await fetch(candidate, {
        method: 'GET',
        redirect: 'error',
        headers: { Accept: 'text/plain, text/markdown, */*;q=0.1' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) continue;
      const len = Number(res.headers.get('content-length') ?? 0);
      if (Number.isFinite(len) && len > MAX_BYTES) {
        await res.body?.cancel().catch(() => undefined);
        continue;
      }
      const contentType = res.headers.get('content-type') ?? '';
      if (contentType && !/text\/|markdown|octet-stream|charset=/i.test(contentType)) {
        await res.body?.cancel().catch(() => undefined);
        continue;
      }
      const bytes = await readResponseBytesWithLimit(res, MAX_BYTES);
      if (!bytes) continue;
      const text = new TextDecoder().decode(bytes);
      if (!text.trim() || text.length > MAX_BYTES) continue;
      const filename = candidate.split('/').pop() ?? 'SKILL.md';
      const draft = parseSkillMarkdown(text.slice(0, USER_SKILL_MAX_MD_CHARS), {
        filename,
        sourceUrl: parsed.data.url,
      });
      return NextResponse.json({ ok: true, draft, resolvedUrl: candidate });
    } catch {
      // Try next candidate
    }
  }

  return NextResponse.json(
    {
      error:
        'Could not find a SKILL.md or README.md at that GitHub URL. Try linking directly to the .md file.',
    },
    { status: 404 },
  );
}
