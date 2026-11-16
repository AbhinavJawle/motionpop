// The download header of the finished video (RFC 6266 and 5987): an ASCII fallback plus the
// real name, percent-encoded, so non-ASCII titles survive and nothing can inject a header.
import { sanitizeFilename } from '@motionpop/schemas';

export function contentDisposition(title: string): string {
  const name = sanitizeFilename(title, 'mp4');
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\%]/g, '_');
  // encodeURIComponent leaves ! ' ( ) * which RFC 5987 does not allow in an ext-value.
  const encoded = encodeURIComponent(name).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
