import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { openEditor, trackPageErrors } from './helpers';

/**
 * The export path in offline mode (spec 08 task 19, R7.3): `/editor/demo` → Export → a real
 * render in the dev server's process (Chrome, the HyperFrames producer and ffmpeg) → the ready
 * dialog → Download → ffprobe on the downloaded file. Needs ffmpeg and a built runtime
 * (`pnpm --filter @motionpop/motion build:runtime`).
 */
test.use({ viewport: { width: 1440, height: 900 } });

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '../e2e-output/export');
/** The second web server of `playwright.config.ts`: offline mode with the producer made to fail. */
const FAIL_URL = 'http://127.0.0.1:3202';

const DEMO_MS = 18_000;
const FRAME_S = 1 / 30;

interface Probe {
  streams: { codec_type: string; codec_name: string; width?: number; height?: number }[];
  format: { format_name: string; duration: string };
}

function probe(file: string): Probe {
  const r = spawnSync(
    'ffprobe',
    ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', file],
    { encoding: 'utf8' },
  );
  if (r.status !== 0) throw new Error(`ffprobe failed: ${r.stderr}`);
  return JSON.parse(r.stdout) as Probe;
}

test('export a video: options, progress, ready, download', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = trackPageErrors(page);
  await openEditor(page, '/editor/demo');

  await page.getByRole('button', { name: 'Export' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Export video' });
  await expect(dialog).toBeVisible();
  // The project card, the free local render and 1080p preselected.
  await expect(dialog.getByText('Untitled Project', { exact: true })).toBeVisible();
  await expect(dialog.getByText('18 sec · 2 scenes')).toBeVisible();
  await expect(dialog.getByText('Local render · free')).toBeVisible();
  await expect(dialog.getByRole('radio', { name: '1080p' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(dialog.getByRole('radio', { name: '16:9' })).toHaveAttribute('aria-checked', 'true');

  await dialog.getByRole('radio', { name: '9:16' }).click();
  await expect(dialog.getByRole('radio', { name: '9:16' })).toHaveAttribute('aria-checked', 'true');
  await dialog.getByRole('button', { name: 'Export video' }).click();

  // Progress appears and advances.
  const bar = page.getByRole('progressbar', { name: 'Export progress' });
  await expect(bar).toBeVisible({ timeout: 20_000 });
  await expect
    .poll(async () => Number(await bar.getAttribute('aria-valuenow')), { timeout: 120_000 })
    .toBeGreaterThan(0);

  // Closing keeps the render, and the top bar shows it (R4.4); a click reopens the progress.
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  const rendering = page.getByRole('button', { name: /^Rendering \d+%/ });
  await expect(rendering).toBeVisible();
  await rendering.click();
  await expect(page.getByRole('progressbar', { name: 'Export progress' })).toBeVisible();

  // The ready dialog.
  await expect(page.getByRole('heading', { level: 3, name: 'Your video is ready' })).toBeVisible({
    timeout: 180_000,
  });
  const ready = page.getByRole('dialog', { name: 'Your video is ready' });
  await expect(ready.getByText('Untitled Project.mp4')).toBeVisible();
  await expect(ready.getByText('1080p · 9:16 · 18 sec')).toBeVisible();

  // Download, then look at the file.
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    ready.getByRole('button', { name: 'Download video' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('Untitled Project.mp4');
  mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, 'demo-9x16-1080p.mp4');
  await download.saveAs(file);

  const info = probe(file);
  const video = info.streams.find((s) => s.codec_type === 'video');
  expect(video?.codec_name).toBe('h264');
  expect([video?.width, video?.height]).toEqual([1080, 1920]);
  expect(info.format.format_name).toContain('mp4');
  expect(info.streams.some((s) => s.codec_type === 'audio')).toBe(true);
  expect(Math.abs(Number(info.format.duration) - DEMO_MS / 1000)).toBeLessThanOrEqual(
    FRAME_S + 0.05,
  );

  // Closing the finished render puts the button back to "Export".
  await ready.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('button', { name: 'Export' }).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test.describe('a render that fails', () => {
  test.use({ baseURL: FAIL_URL });

  test('shows the error state and "Try again" sends a new request', async ({ page }) => {
    test.setTimeout(180_000);
    const errors = trackPageErrors(page);
    const posts: string[] = [];
    page.on('request', (r) => {
      if (r.method() === 'POST' && new URL(r.url()).pathname === '/api/local-renders') {
        posts.push(r.url());
      }
    });
    await openEditor(page, '/editor/demo');
    await page.getByRole('button', { name: 'Export' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Export video' });
    await dialog.getByRole('button', { name: 'Export video' }).click();

    await expect(dialog.getByText("That one didn't make it")).toBeVisible({ timeout: 120_000 });
    // A free local render has no credits to give back, so the message does not promise any.
    await expect(dialog.getByRole('alert')).toHaveText('Pip dropped a frame.');
    expect(posts.length).toBe(1);

    await dialog.getByRole('button', { name: 'Try again' }).click();
    await expect(dialog.getByText("That one didn't make it")).toBeVisible({ timeout: 120_000 });
    expect(posts.length).toBe(2);

    // The top bar is back to its normal "Export" button.
    // The ✕ and the "Close" button share a name: the button is the one with text.
    await dialog.getByRole('button', { name: 'Close' }).filter({ hasText: 'Close' }).click();
    await expect(page.getByRole('button', { name: 'Export' }).first()).toBeVisible();
    expect(errors).toEqual([]);
  });
});
