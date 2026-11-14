import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DEFAULT_AFTER_SIGN_IN, safeNextPath, signInHref } from './next-path';

describe('safeNextPath', () => {
  it.each([
    ['/editor/abc', '/editor/abc'],
    ['/processing/new?x=1', '/processing/new?x=1'],
    ['  /dashboard  ', '/dashboard'],
  ])('keeps same-origin path %s', (raw, expected) => {
    expect(safeNextPath(raw)).toBe(expected);
  });

  it.each([
    [null],
    [undefined],
    [''],
    ['https://evil.example'],
    ['//evil.example/path'],
    ['/\\evil.example'],
    ['javascript:alert(1)'],
    ['editor/abc'],
    ['/\t/evil.example'],
    ['/sign-in'],
    ['/sign-in?next=/x'],
  ])('falls back for %s', (raw) => {
    expect(safeNextPath(raw)).toBe(DEFAULT_AFTER_SIGN_IN);
  });

  it('never returns anything a browser would resolve off-origin', () => {
    fc.assert(
      fc.property(fc.string(), (raw) => {
        const out = safeNextPath(raw);
        const url = new URL(out, 'https://app.example');
        expect(url.origin).toBe('https://app.example');
      }),
    );
  });
});

describe('signInHref', () => {
  it('encodes the protected location as next', () => {
    expect(signInHref('/editor/a b?x=1')).toBe('/sign-in?next=%2Feditor%2Fa%20b%3Fx%3D1');
  });
  it('uses the default for unsafe locations', () => {
    expect(signInHref('//evil')).toBe(`/sign-in?next=${encodeURIComponent('/dashboard')}`);
  });
});
