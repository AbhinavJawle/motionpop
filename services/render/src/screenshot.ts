// Website screenshots for reels (spec 26 R3.3): the speaker names a site, the reel shows its real
// page in a browser frame. Taken by our own headless Chrome (no third-party screenshot API).
// The caller validates the host; this module refuses anything but a public https hostname and
// blocks requests to private networks while the page loads.
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export const SCREENSHOT_W = 1280;
export const SCREENSHOT_H = 1800;
const HOST_RE = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

/** Private, loopback, link-local and metadata ranges (v4 and v6). */
export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a = 0, b = 0] = ip.split('.').map(Number);
    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224
    );
  }
  const v = ip.toLowerCase();
  return (
    v === '::1' ||
    v === '::' ||
    v.startsWith('fc') ||
    v.startsWith('fd') ||
    v.startsWith('fe80') ||
    v.startsWith('::ffff:')
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

async function hostIsPublic(host: string): Promise<boolean> {
  try {
    const addrs = await lookup(host, { all: true });
    return addrs.length > 0 && addrs.every((a) => !isPrivateAddress(a.address));
  } catch {
    return false;
  }
}

/** The page's top 1280 × 1800 as PNG bytes, or null when it can't be taken safely. */
export async function takeScreenshot(input: string): Promise<Uint8Array | null> {
  const host = screenshotHost(input);
  if (!host || !(await hostIsPublic(host))) return null;
  const puppeteer = await import('puppeteer');
  const browser = await puppeteer.default.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: SCREENSHOT_W, height: 900, deviceScaleFactor: 1 });
    await page.setRequestInterception(true);
    const checked = new Map<string, boolean>();
    page.on('request', (req) => {
      void (async () => {
        let ok = false;
        try {
          const u = new URL(req.url());
          if (u.protocol === 'data:' || u.protocol === 'blob:') ok = true;
          else if (u.protocol === 'https:' || u.protocol === 'http:') {
            const h = u.hostname;
            if (!checked.has(h)) checked.set(h, !isIP(h) && (await hostIsPublic(h)));
            ok = checked.get(h) ?? false;
          }
        } catch {
          ok = false;
        }
        if (ok) await req.continue();
        else await req.abort();
      })().catch(() => undefined);
    });
    await page
      .goto(`https://${host}`, { waitUntil: 'networkidle2', timeout: 25_000 })
      .catch(() => undefined);
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
    await browser.close();
  }
}
