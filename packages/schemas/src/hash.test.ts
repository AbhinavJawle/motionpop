import { describe, expect, it } from 'vitest';
import { sha256Hex, stableJson } from './hash';

describe('sha256Hex', () => {
  it('matches the FIPS 180-4 test vectors', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
  });

  it('hashes multi-byte UTF-8 the same way as the standard', () => {
    // sha256 of the UTF-8 bytes of "é" (C3 A9), as computed by Python's hashlib.
    expect(sha256Hex('é')).toBe('4a99557e4033c3539de2eb65472017cad5f9557f7a0625a09f1c3f6e2ba69c4c');
  });
});

describe('stableJson', () => {
  it('gives the same text for the same value whatever the key order', () => {
    expect(stableJson({ b: 1, a: { d: [1, 2], c: 'x' } })).toBe(
      stableJson({ a: { c: 'x', d: [1, 2] }, b: 1 }),
    );
  });

  it('keeps array order and drops undefined members', () => {
    expect(stableJson({ a: [2, 1], b: undefined, c: null })).toBe('{"a":[2,1],"c":null}');
  });
});
