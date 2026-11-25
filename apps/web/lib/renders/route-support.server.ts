import 'server-only';
import { LedgerError } from '@motionpop/render/store';
import { HttpError, errorResponse } from '@/lib/firebase/verify.server';
import { apiError, MAX_BODY_BYTES, type HandlerResult } from './handlers.server';

/** A handler's answer as a JSON response. */
export const respond = (r: HandlerResult): Response =>
  Response.json(r.body, { status: r.status, headers: { 'cache-control': 'no-store' } });

/**
 * The error answer of a render route. A failed credential check is the API's `unauthorized`; a
 * missing user doc is a 409 (the client runs bootstrap and tries once more, as for credits);
 * anything else is a 500 without details.
 */
export function renderRouteError(err: unknown): Response {
  if (err instanceof HttpError && err.status === 401) return respond(apiError('unauthorized'));
  if (err instanceof LedgerError) {
    return Response.json({ error: 'not-bootstrapped' }, { status: 409 });
  }
  return errorResponse(err);
}

/** The body as text, stopping as soon as it passes `max` bytes (no `content-length` is trusted). */
export async function readBodyText(
  req: Request,
  max: number = MAX_BODY_BYTES,
): Promise<{ text: string } | { tooLarge: true }> {
  const declared = Number(req.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > max) return { tooLarge: true };
  if (!req.body) return { text: '' };
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => undefined);
      return { tooLarge: true };
    }
    chunks.push(value);
  }
  return { text: Buffer.concat(chunks).toString('utf8') };
}

const SAFE_HOST_RE = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::\d{1,5})?$/i;

/** The public origin of this request, for share links (prefers NEXT_PUBLIC_APP_URL, else rightmost forwarded host). */
export function originOf(req: Request, env: Record<string, string | undefined> = process.env): string {
  const configured = env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured && /^https?:\/\//i.test(configured)) {
    try {
      return new URL(configured).origin;
    } catch {
      // fall through
    }
  }
  const url = new URL(req.url);
  const fwdHost = req.headers.get('x-forwarded-host')?.split(',').pop()?.trim();
  const host = fwdHost || req.headers.get('host')?.trim() || url.host;
  const fwdProto = req.headers.get('x-forwarded-proto')?.split(',').pop()?.trim().toLowerCase();
  const proto = fwdProto || url.protocol.replace(':', '');
  return SAFE_HOST_RE.test(host)
    ? `${proto === 'http' ? 'http' : 'https'}://${host}`
    : url.origin;
}
