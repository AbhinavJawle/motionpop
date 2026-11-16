import { describe, expect, it } from 'vitest';
import { LedgerError } from '@motionpop/render/store';
import { HttpError } from '@/lib/firebase/verify.server';
import { originOf, readBodyText, renderRouteError, respond } from './route-support.server';

const req = (
  body: BodyInit | null,
  headers: Record<string, string> = {},
  url = 'http://localhost:3000/x',
) => new Request(url, { method: 'POST', body, headers });

describe('readBodyText', () => {
  it('reads a body under the limit', async () => {
    expect(await readBodyText(req('{"a":1}'), 100)).toEqual({ text: '{"a":1}' });
    expect(await readBodyText(new Request('http://x/', { method: 'POST' }), 100)).toEqual({
      text: '',
    });
  });

  it('stops at the limit without trusting content-length', async () => {
    expect(await readBodyText(req('x'.repeat(101)), 100)).toEqual({ tooLarge: true });
    expect(await readBodyText(req('x'.repeat(100)), 100)).toEqual({ text: 'x'.repeat(100) });
    // A lying (small) content-length does not help, and a big one is refused up front.
    expect(await readBodyText(req('x'.repeat(500), { 'content-length': '5' }), 100)).toEqual({
      tooLarge: true,
    });
    expect(await readBodyText(req('x', { 'content-length': '999' }), 100)).toEqual({
      tooLarge: true,
    });
  });
});

describe('originOf', () => {
  it('uses the forwarded host and protocol behind the hosting proxy', () => {
    expect(
      originOf(req('', { 'x-forwarded-host': 'motionpop.app', 'x-forwarded-proto': 'https' })),
    ).toBe('https://motionpop.app');
  });

  it('falls back to the request URL and ignores a host that is not plain host[:port]', () => {
    expect(originOf(req('', { host: 'localhost:3000' }, 'http://localhost:3000/x'))).toBe(
      'http://localhost:3000',
    );
    expect(
      originOf(req('', { 'x-forwarded-host': 'evil.com/<script>' }, 'http://localhost:3000/x')),
    ).toBe('http://localhost:3000');
  });
});

describe('renderRouteError and respond', () => {
  it('maps a failed credential check to the API’s `unauthorized`', async () => {
    const r = renderRouteError(new HttpError(401, 'Missing ID token'));
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ error: 'unauthorized' });
  });

  it('maps a missing user doc to 409 and anything else to a 500 without details', async () => {
    const a = renderRouteError(new LedgerError('not-bootstrapped', 'x'));
    expect(a.status).toBe(409);
    expect(await a.json()).toEqual({ error: 'not-bootstrapped' });
    const b = renderRouteError(new Error('secret db detail'));
    expect(b.status).toBe(500);
    expect(JSON.stringify(await b.json())).not.toContain('secret');
  });

  it('answers JSON with no-store', async () => {
    const r = respond({ status: 201, body: { a: 1 } });
    expect(r.status).toBe(201);
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(await r.json()).toEqual({ a: 1 });
  });
});
