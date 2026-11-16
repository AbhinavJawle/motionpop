import 'server-only';
import type { z } from 'zod';
import { HttpError } from '@/lib/firebase/verify.server';

/** Reads the JSON body of a request and parses it, answering 400 for bad JSON or a bad shape. */
export async function parseJsonBody<S extends z.ZodType>(
  req: Request,
  schema: S,
): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new HttpError(400, 'Body must be JSON');
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new HttpError(400, 'Invalid request');
  return parsed.data;
}
