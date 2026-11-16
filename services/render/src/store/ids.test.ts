import { randomUUID } from 'node:crypto';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { isSafeId, renderPaths } from '@motionpop/schemas';
import { newShareId, renderIdFor } from './ids';

describe('newShareId', () => {
  it('is 22 base64url characters (128 bits)', () => {
    for (let i = 0; i < 200; i++) expect(newShareId()).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it('does not repeat over many draws (R8.5)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 20_000; i++) seen.add(newShareId());
    expect(seen.size).toBe(20_000);
  });

  it('every position varies (not a counter or a truncated value)', () => {
    const chars = Array.from({ length: 22 }, () => new Set<string>());
    for (let i = 0; i < 400; i++) [...newShareId()].forEach((c, k) => chars[k]!.add(c));
    // 128 bits fill 21 characters of 6 bits and 2 bits of the last one, which has 4 values.
    for (const s of chars.slice(0, 21)) expect(s.size).toBeGreaterThan(10);
    expect(chars[21]!.size).toBe(4);
  });
});

describe('renderIdFor', () => {
  const uid = 'user-1';
  const requestId = '3f1c2b7a-9d4e-4f6a-8b1c-0a2d3e4f5a6b';

  it('is stable for the same caller and request (a double click is one render)', () => {
    expect(renderIdFor(uid, requestId)).toBe(renderIdFor(uid, requestId));
    expect(renderIdFor(uid, requestId)).toBe(renderIdFor(uid, requestId.toUpperCase()));
  });

  it('differs per caller and per request, so another user can not claim it', () => {
    expect(renderIdFor('user-2', requestId)).not.toBe(renderIdFor(uid, requestId));
    expect(renderIdFor(uid, randomUUID())).not.toBe(renderIdFor(uid, requestId));
  });

  it('is a 22 character safe id that makes a valid render path', () => {
    const id = renderIdFor(uid, requestId);
    expect(id).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(isSafeId(id)).toBe(true);
    expect(() => renderPaths(uid, 'project-1', id)).not.toThrow();
  });

  it('property: ids are unique over random requests and always safe', () => {
    fc.assert(
      fc.property(fc.uuid(), fc.uuid(), (a, b) => {
        const ia = renderIdFor(uid, a);
        expect(isSafeId(ia)).toBe(true);
        if (a !== b) expect(renderIdFor(uid, b)).not.toBe(ia);
      }),
      { numRuns: 500 },
    );
  });

  it('rejects an unsafe uid or a request id that is not a UUID', () => {
    expect(() => renderIdFor('a/b', requestId)).toThrow(RangeError);
    expect(() => renderIdFor('..', requestId)).toThrow(RangeError);
    expect(() => renderIdFor(uid, 'not-a-uuid')).toThrow(RangeError);
    expect(() => renderIdFor(uid, '')).toThrow(RangeError);
  });
});
