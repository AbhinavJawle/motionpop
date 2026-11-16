// Preflight (spec 08 design §8, R3.4): the runtime keeps slot errors in `window.__motionpop.errors`
// and, in render mode, leaves a failing slot empty. The producer knows nothing about them, so
// before rendering we load the composition in headless Chrome, seek to the moments that matter
// and fail the render if any slot reported an error.
import { FORMATS } from '@motionpop/schemas';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
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

export function createChromePreflight(opts: ChromePreflightOptions = {}): Preflight {
  return {
    async check({ compDir, format, samplesMs, signal }) {
      const html = await readFile(join(compDir, 'index.html'), 'utf8');
      const { width, height } = FORMATS[format];
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
        await page.setContent(html, { waitUntil: 'load' });
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
      }
    },
  };
}
