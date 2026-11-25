import 'server-only';
import type { z } from 'zod';
import { HttpError } from '@/lib/firebase/verify.server';
import { readBodyText } from '@/lib/renders/route-support.server';

const MAX_JSON_BODY_BYTES = 64 * 1024;

/** Reads the JSON body of a request (capped at 64 KB) and parses it, answering 400/413 on bad input. */
export async function parseJsonBody<S extends z.ZodType>(
  req: Request,
  schema: S,
  maxBytes: number = MAX_JSON_BODY_BYTES,
): Promise<z.infer<S>> {
  const bodyRead = await readBodyText(req, maxBytes);
  if ('tooLarge' in bodyRead) {
    throw new HttpError(413, 'Request body too large');
  }
  let raw: unknown;
  try {
    raw = JSON.parse(bodyRead.text);
  } catch {
    throw new HttpError(400, 'Body must be JSON');
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new HttpError(400, 'Invalid request');
  return parsed.data;
}
