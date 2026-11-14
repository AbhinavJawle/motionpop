import 'server-only';
import { adminAppCheck, adminAuth, usingEmulators } from './admin.server';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface VerifiedCaller {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
  picture: string | null;
}

/**
 * Verify the Firebase ID token (`Authorization: Bearer`) and the App Check token
 * (`X-Firebase-AppCheck`) on every API route (spec 01 R4.5). Throws `HttpError(401)`.
 *
 * App Check is skipped only for local emulator runs outside production: emulator ID tokens come
 * from a fake project, so there's no real attestation to check.
 */
export async function verifyRequest(req: Request): Promise<VerifiedCaller> {
  const header = req.headers.get('authorization') ?? '';
  const idToken = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
  if (!idToken) throw new HttpError(401, 'Missing ID token');

  const skipAppCheck = usingEmulators() && process.env.NODE_ENV !== 'production';
  if (!skipAppCheck) {
    const appCheckToken = req.headers.get('x-firebase-appcheck') ?? '';
    if (!appCheckToken) throw new HttpError(401, 'Missing App Check token');
    try {
      await adminAppCheck().verifyToken(appCheckToken);
    } catch {
      throw new HttpError(401, 'Invalid App Check token');
    }
  }

  try {
    const decoded = await adminAuth().verifyIdToken(idToken);
    return {
      uid: decoded.uid,
      email: decoded.email ?? null,
      emailVerified: decoded.email_verified === true,
      name: typeof decoded.name === 'string' ? decoded.name : null,
      picture: decoded.picture ?? null,
    };
  } catch {
    throw new HttpError(401, 'Invalid ID token');
  }
}

/** JSON error response for a thrown error; unknown errors become a 500 without details. */
export function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  console.error(err);
  return Response.json({ error: 'Internal error' }, { status: 500 });
}
