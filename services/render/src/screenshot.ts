// Website screenshots for reels (spec 26 R3.3): the speaker names a site, the reel shows its real
// page in a browser frame. Taken by our own headless Chrome (no third-party screenshot API).
// The caller validates the host; this module refuses anything but a public https hostname and
// blocks requests to private networks while the page loads.
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export const SCREENSHOT_W = 1280;
export const SCREENSHOT_H = 1800;
const HOST_RE = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

/** Private, loopback, link-local, documentation, NAT64, multicast and metadata ranges (v4 and v6). */
export function isPrivateAddress(ip: string): boolean {
  const clean = ip.trim().toLowerCase().split('%')[0] ?? '';
  if (isIP(clean) === 4) {
    const [a = 0, b = 0, c = 0] = clean.split('.').map(Number);
    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 192 && b === 0 && (c === 0 || c === 2)) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113) ||
      a >= 224
    );
  }
  if (isIP(clean) !== 6) return true;
  if (clean === '::1' || clean === '::' || /^(?:0*:)+0*[01]?$/.test(clean)) return true;
  // IPv4-mapped / IPv4-compatible / NAT64 / ULA / full link-local fe80::/10 / multicast / doc / 6to4 / Teredo.
  return (
    clean.startsWith('::ffff:') ||
    clean.startsWith('fc') ||
    clean.startsWith('fd') ||
    /^fe[89ab][0-9a-f]:/.test(clean) ||
    clean.startsWith('ff') ||
    clean.startsWith('64:ff9b:') ||
    clean.startsWith('100::') ||
    clean.startsWith('2001:db8:') ||
    clean.startsWith('2001:0:') ||
    clean.startsWith('2001::') ||
    clean.startsWith('2002:')
  );
}

/** A public hostname from a spoken domain ("example.com", "https://www.example.com/x"). */
export function screenshotHost(input: string): string | null {
  const host = input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .split(/[/?#]/)[0]!
    .replace(/:\d+$/, '');
  if (!HOST_RE.test(host) || isIP(host)) return null;
  if (/\.(local|internal|localhost|lan|home|corp)$/.test(host)) return null;
  return host;
}

async function resolvePublicIp(host: string): Promise<string | null> {
  try {
    const addrs = await lookup(host, { all: true });
    if (addrs.length === 0 || !addrs.every((a) => !isPrivateAddress(a.address))) return null;
    const v4 = addrs.find((a) => a.family === 4);
    return (v4 ?? addrs[0])?.address ?? null;
  } catch {
    return null;
  }
}

/** The page's top 1280 × 1800 as PNG bytes, or null when it can't be taken safely. */
export async function takeScreenshot(input: string): Promise<Uint8Array | null> {
  const host = screenshotHost(input);
  if (!host) return null;
  const pinnedIp = await resolvePublicIp(host);
  if (!pinnedIp) return null;
  const puppeteer = await import('puppeteer');
  const pinnedTarget = isIP(pinnedIp) === 6 ? `[${pinnedIp}]` : pinnedIp;
  const args = [
    // Pin the target host to the already-validated public IP so Chromium cannot DNS-rebind it.
    `--host-resolver-rules=MAP ${host} ${pinnedTarget}`,
    ...(process.env['CHROME_NO_SANDBOX'] === '1'
      ? ['--no-sandbox', '--disable-setuid-sandbox']
      : []),
  ];
  const browser = await puppeteer.default.launch({ headless: true, args });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: SCREENSHOT_W, height: 900, deviceScaleFactor: 1 });
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      void (async () => {
        let ok = false;
        try {
          const u = new URL(req.url());
          if (u.protocol === 'data:' || u.protocol === 'blob:') {
            ok = true;
          } else if (u.protocol === 'https:') {
            const h = u.hostname.toLowerCase();
            if (h === host) ok = true;
            else if (!isIP(h) && screenshotHost(h)) ok = (await resolvePublicIp(h)) !== null;
          }
        } catch {
          ok = false;
        }
        if (ok) await req.continue();
        else await req.abort('blockedbyclient');
      })().catch(() => undefined);
    });
    await page.goto(`https://${host}`, { waitUntil: 'networkidle2', timeout: 25_000 });
    await new Promise((r) => setTimeout(r, 1000));
    const shot = await page.screenshot({
      type: 'png',
      clip: { x: 0, y: 0, width: SCREENSHOT_W, height: SCREENSHOT_H },
      captureBeyondViewport: true,
    });
    return new Uint8Array(shot);
  } catch {
    return null;
  } finally {
    await browser.close().catch(() => undefined);
  }
}
