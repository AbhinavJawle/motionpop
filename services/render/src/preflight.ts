// Preflight (spec 08 design §8, R3.4): the runtime keeps slot errors in `window.__motionpop.errors`
// and, in render mode, leaves a failing slot empty. The producer knows nothing about them, so
// before rendering we load the composition in headless Chrome, seek to the moments that matter
// and fail the render if any slot reported an error.
import { FORMATS } from '@motionpop/schemas';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, normalize, sep } from 'node:path';
import puppeteer from 'puppeteer';
import type { Preflight, SlotIssue } from './ports';

export { preflightSamples } from './preflight-samples';

interface PageApi {
  __motionpop?: {
    ready: Promise<void>;
    seek: (tMs: number) => void;
    errors: { slotId: string; phase: string; message: string }[];
  };
}

export interface ChromePreflightOptions {
  /** Chrome without its sandbox, for containers that cannot give it one. */
  noSandbox?: boolean;
  /** Longest wait for the runtime to be ready. */
  readyTimeoutMs?: number;
  /**
   * A chrome-headless-shell binary (the image ships only that one, the same the producer uses);
   * unset, puppeteer's own Chrome.
   */
  headlessShellPath?: string;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
};

/**
 * Serves `dir` on 127.0.0.1 (a random port) the way the producer serves it, so the composition's
 * relative assets (pictures, map imagery) load in the preflight exactly as they will in the render.
 * `setContent` gave the page an about:blank origin where relative URLs never resolved.
 */
export async function serveDir(dir: string): Promise<{ url: string; close: () => Promise<void> }> {
  const root = normalize(dir + sep);
  const server: Server = createServer((req, res) => {
    void (async () => {
      const path = decodeURIComponent((req.url ?? '/').split('?')[0] ?? '/');
      const file = normalize(join(root, path === '/' ? 'index.html' : path));
      if (!file.startsWith(root)) return res.writeHead(403).end();
      const info = await stat(file).catch(() => null);
      if (!info?.isFile()) return res.writeHead(404).end();
      res.writeHead(200, {
        'Content-Type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
        'Content-Length': String(info.size),
      });
      createReadStream(file).pipe(res);
    })();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/index.html`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

export function createChromePreflight(opts: ChromePreflightOptions = {}): Preflight {
  return {
    async check({ compDir, format, samplesMs, signal }) {
      const { width, height } = FORMATS[format];
      const served = await serveDir(compDir);
      const browser = await puppeteer.launch({
        ...(opts.headlessShellPath
          ? { headless: 'shell' as const, executablePath: opts.headlessShellPath }
          : { headless: true }),
        args: opts.noSandbox ? ['--no-sandbox', '--disable-setuid-sandbox'] : [],
      });
      const onAbort = () => void browser.close().catch(() => undefined);
      signal.addEventListener('abort', onAbort, { once: true });
      try {
        const page = await browser.newPage();
        await page.setViewport({ width, height, deviceScaleFactor: 1 });
        await page.goto(served.url, { waitUntil: 'load' });
        const timeout = opts.readyTimeoutMs ?? 30_000;
        const ready = await page.evaluate(async (ms) => {
          const api = (window as unknown as PageApi).__motionpop;
          if (!api) return false;
          const timer = new Promise<'timeout'>((r) => setTimeout(() => r('timeout'), ms));
          return (await Promise.race([api.ready.then(() => 'ready' as const), timer])) === 'ready';
        }, timeout);
        if (!ready) throw new Error('the motion runtime did not become ready');
        for (const t of samplesMs) {
          await page.evaluate((ms) => (window as unknown as PageApi).__motionpop?.seek(ms), t);
        }
        const errors = await page.evaluate(
          () => (window as unknown as PageApi).__motionpop?.errors ?? [],
        );
        // A runtime error is reported once per slot and phase; keep the first per slot.
        const seen = new Set<string>();
        const issues: SlotIssue[] = [];
        for (const e of errors) {
          if (seen.has(e.slotId)) continue;
          seen.add(e.slotId);
          issues.push({ slotId: e.slotId, message: `${e.phase}: ${e.message}` });
        }
        return issues;
      } finally {
        signal.removeEventListener('abort', onAbort);
        await browser.close().catch(() => undefined);
        await served.close();
      }
    },
  };
}
