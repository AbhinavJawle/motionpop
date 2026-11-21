import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { ImageAssetSchema, canRender } from './asset';

const hex64 = fc.stringMatching(/^[0-9a-f]{64}$/);
const status = fc.constantFrom('pending' as const, 'ready' as const, 'failed' as const);

const asset = (hash: string) => ({
  id: 'a1',
  hash,
  status: 'ready',
  source: 'generated',
  subject: 'an old cargo ship',
  keyed: true,
  width: 1024,
  height: 1024,
  src: 'users/u/a1.png',
});

describe('ImageAssetSchema', () => {
  it('accepts any 64-char lowercase hex hash', () => {
    fc.assert(fc.property(hex64, (h) => ImageAssetSchema.safeParse(asset(h)).success));
  });
  it('rejects uppercase, wrong length and non-hex hashes', () => {
    const h = 'a'.repeat(64);
    expect(ImageAssetSchema.safeParse(asset(h.toUpperCase())).success).toBe(false);
    expect(ImageAssetSchema.safeParse(asset(h.slice(1))).success).toBe(false);
    expect(ImageAssetSchema.safeParse(asset(h + 'a')).success).toBe(false);
    expect(ImageAssetSchema.safeParse(asset('g'.repeat(64))).success).toBe(false);
    expect(ImageAssetSchema.safeParse(asset('')).success).toBe(false);
  });
  it('rejects a subject over 120 characters and non-positive sizes', () => {
    const h = 'a'.repeat(64);
    expect(ImageAssetSchema.safeParse({ ...asset(h), subject: 'x'.repeat(121) }).success).toBe(
      false,
    );
    expect(ImageAssetSchema.safeParse({ ...asset(h), width: 0 }).success).toBe(false);
    expect(ImageAssetSchema.safeParse({ ...asset(h), height: 1.5 }).success).toBe(false);
  });
  it('rejects an unknown status or source', () => {
    const h = 'a'.repeat(64);
    expect(ImageAssetSchema.safeParse({ ...asset(h), status: 'done' }).success).toBe(false);
    expect(ImageAssetSchema.safeParse({ ...asset(h), source: 'scraped' }).success).toBe(false);
  });
});

describe('canRender', () => {
  it('is false exactly when some asset is pending', () => {
    fc.assert(
      fc.property(fc.array(fc.record({ status }), { maxLength: 20 }), (assets) => {
        expect(canRender(assets)).toBe(!assets.some((a) => a.status === 'pending'));
      }),
    );
  });
  it('is true for no assets', () => {
    expect(canRender([])).toBe(true);
  });
});
