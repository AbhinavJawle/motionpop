// Ids that need Node's `crypto` (spec 08 R2.6, R8.5). Server code only.
import { createHash, randomBytes } from 'node:crypto';
import { isSafeId } from '@motionpop/schemas';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The render id of a request: stable for the same caller and request id (a double click or a
 * network retry maps to the same render), and not guessable without the caller's request id.
 * 22 base64url characters of a SHA-256 over both inputs. A safe Storage path segment.
 */
export function renderIdFor(uid: string, requestId: string): string {
  if (!isSafeId(uid)) throw new RangeError('uid is not a safe id');
  if (!UUID.test(requestId)) throw new RangeError('requestId must be a UUID');
  return createHash('sha256')
    .update(`motionpop-render\0${uid}\0${requestId.toLowerCase()}`)
    .digest('base64url')
    .slice(0, 22);
}

/** A share id: 128 random bits as 22 base64url characters. */
export function newShareId(): string {
  return randomBytes(16).toString('base64url');
}
