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

/** The public origin of this request, for share links (behind App Hosting the Host header is the site). */
export function originOf(req: Request): string {
  const url = new URL(req.url);
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? url.host;
  const proto = req.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '');
  // A Host header is client-controlled; only plain host[:port] values are used.
  return /^[A-Za-z0-9.-]+(:\d{1,5})?$/.test(host)
    ? `${proto === 'http' ? 'http' : 'https'}://${host}`
    : url.origin;
}
