import { describe, expect, it } from 'vitest';
import { contentDisposition } from './headers';

describe('contentDisposition', () => {
  it('has an ASCII fallback and the percent-encoded real name', () => {
    expect(contentDisposition('Untitled Project')).toBe(
      `attachment; filename="Untitled Project.mp4"; filename*=UTF-8''Untitled%20Project.mp4`,
    );
  });

  it('keeps non-ASCII titles in the encoded part only', () => {
    const h = contentDisposition('Café 日本 🎬');
    expect(h).toContain('filename="Caf_ __ _');
    expect(h).toContain("filename*=UTF-8''Caf%C3%A9%20%E6%97%A5%E6%9C%AC%20%F0%9F%8E%AC.mp4");
    expect(h).toMatch(/^[\x20-\x7e]+$/);
  });

  it('cannot be used to inject a header or a second parameter', () => {
    const h = contentDisposition('a"; filename=evil.exe\r\nSet-Cookie: x=1');
    expect(h).not.toMatch(/[\r\n]/);
    // One quoted string with no way out of it, then the encoded name with only safe characters.
    expect(h).toMatch(/^attachment; filename="[^"\\]*"; filename\*=UTF-8''[A-Za-z0-9%._~-]+$/);
  });

  it('encodes the characters RFC 5987 does not allow', () => {
    expect(contentDisposition("it's (a) title")).toContain(
      "filename*=UTF-8''it%27s%20%28a%29%20title.mp4",
    );
  });

  it('falls back for an empty or hostile title', () => {
    expect(contentDisposition('')).toContain('filename="motionpop video.mp4"');
    expect(contentDisposition('../../..')).not.toContain('/');
  });

  it('uses .webm when container is webm (spec 47)', () => {
    expect(contentDisposition('Lower Third', 'webm')).toBe(
      `attachment; filename="Lower Third.webm"; filename*=UTF-8''Lower%20Third.webm`,
    );
  });
});
