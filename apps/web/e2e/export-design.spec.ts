import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Locator, type Page } from '@playwright/test';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { openEditor, trackPageErrors } from './helpers';

/**
 * Design check (spec 08 task 18): every state of the export dialogs at 1440×900 (scale 2),
 * saved under `e2e-output/design/` next to the design PNG, and the two designed states compared
 * with `design/screens/export.png` and `export-ready.png` inside the dialog's rectangle.
 * The render routes are mocked, so each state is deterministic and no render runs.
 */
test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DESIGN_DIR = path.resolve(HERE, '../../../design/screens');
const OUT = path.resolve(HERE, '../e2e-output/design');

/** The dialogs in 2× pixels: [x, y, width, height]. */
const EXPORT_BOX: [number, number, number, number] = [880, 132, 1120, 1536];
const READY_BOX: [number, number, number, number] = [880, 262, 1120, 1276];

/**
 * Max share of differing pixels inside each dialog (pixelmatch threshold 0.1). Measured 11.5 % and
 * 4.7 %; the rest is content the design cannot share (see the remaining differences in the task 18
 * note: the thumbnail frame, scene count and note, the "Soon" switches, the icons).
 */
// export: 17 (was 16) since the sublines and the Free row shift the lower half (overnight QA).
const MAX_DIFF_PCT = { export: 17, 'export-ready': 8 };

function crop(png: PNG, [x, y, w, h]: [number, number, number, number]): PNG {
  const out = new PNG({ width: w, height: h });
  PNG.bitblt(png, out, x, y, w, h, 0, 0);
  return out;
}

const STATUS = {
  title: 'Untitled Project',
  format: '16:9',
  resolution: '1080p',
  durationMs: 18_000,
  costCredits: 0,
};

interface Script {
  /** Status answers, in order; the last one repeats. */
  answers: object[];
}

async function mockRenders(page: Page, script: Script): Promise<void> {
  let polls = 0;
  await page.route('**/api/local-renders', (route) =>
    route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ renderId: 'rdesign', costCredits: 0, balanceAfter: 0 }),
    }),
  );
  // No thumb.jpg in the mock: the file card falls back to the still.
  await page.route('**/api/local-renders/rdesign/thumb', (route) =>
    route.fulfill({ status: 404, body: 'Not found' }),
  );
  await page.route('**/api/local-renders/rdesign', (route) => {
    const answer = script.answers[Math.min(polls++, script.answers.length - 1)];
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ renderId: 'rdesign', ...STATUS, ...answer }),
    });
  });
}

/** A box in CSS pixels, to 1 px: the geometry the design fixes (design §13.1, §13.3). */
async function expectSize(locator: Locator, width: number, height: number, label: string) {
  const box = await locator.boundingBox();
  expect(box, label).not.toBeNull();
  expect(Math.round(box?.width ?? 0), `${label} width`).toBe(width);
  expect(Math.round(box?.height ?? 0), `${label} height`).toBe(height);
}

async function openExport(page: Page): Promise<void> {
  await openEditor(page, '/editor/demo?t=5600&select=slot-2');
  await page.evaluate(() => document.fonts.ready);
  await page.getByRole('button', { name: 'Export' }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  // The entry spring, the still's compile and the fonts settle.
  await page.waitForTimeout(2_500);
}

async function save(page: Page, name: string): Promise<Buffer> {
  mkdirSync(OUT, { recursive: true });
  const shot = await page.screenshot({ animations: 'disabled' });
  writeFileSync(path.join(OUT, `${name}.actual.png`), shot);
  return shot;
}

function compare(
  name: 'export' | 'export-ready',
  shot: Buffer,
  box: [number, number, number, number],
) {
  const designBytes = readFileSync(path.join(DESIGN_DIR, `${name}.png`));
  writeFileSync(path.join(OUT, `${name}.design.png`), designBytes);
  const actual = crop(PNG.sync.read(shot), box);
  const design = crop(PNG.sync.read(designBytes), box);
  const diff = new PNG({ width: box[2], height: box[3] });
  const count = pixelmatch(actual.data, design.data, diff.data, box[2], box[3], { threshold: 0.1 });
  writeFileSync(path.join(OUT, `${name}.diff.png`), PNG.sync.write(diff));
  // Side by side: actual | design.
  const side = new PNG({ width: box[2] * 2 + 16, height: box[3] });
  PNG.bitblt(actual, side, 0, 0, box[2], box[3], 0, 0);
  PNG.bitblt(design, side, 0, 0, box[2], box[3], box[2] + 16, 0);
  writeFileSync(path.join(OUT, `${name}.side-by-side.png`), PNG.sync.write(side));
  return (count / (box[2] * box[3])) * 100;
}

test('export dialog options match export.png', async ({ page }) => {
  const errors = trackPageErrors(page);
  await openExport(page);
  // The dialog and its parts are the sizes of the design (the left-out note adds 18 px; the
  // captions and "music and effects" sublines and the Free chip of free exports, D-074, add 28).
  const dialog = page.getByRole('dialog');
  const box = await dialog.boundingBox();
  expect(Math.round(box?.width ?? 0)).toBe(560);
  expect(Math.round(box?.x ?? 0)).toBe(440);
  // Spec 33 (D-081): 44 px format cards, 40 px resolution cards and a 44 px button.
  expect(Math.round(box?.height ?? 0)).toBe(768 + 18 + 28 - 14);
  await expectSize(dialog.getByRole('radio', { name: '16:9' }), 160, 44, 'format card');
  await expectSize(dialog.getByRole('radio', { name: '1080p' }), 160, 40, 'resolution card');
  await expectSize(dialog.getByRole('button', { name: 'Export video' }), 496, 44, 'export button');
  await expectSize(dialog.getByTestId('video-still'), 192, 108, 'thumbnail');
  const shot = await save(page, 'export');
  const pct = compare('export', shot, EXPORT_BOX);
  writeFileSync(path.join(OUT, 'export.report.json'), JSON.stringify({ diffPct: pct }, null, 2));
  console.log(`export dialog diff: ${pct.toFixed(2)} %`);
  expect(pct).toBeLessThanOrEqual(MAX_DIFF_PCT.export);
  expect(errors).toEqual([]);
});

test('export dialog progress and error states', async ({ page }) => {
  const errors = trackPageErrors(page);
  await mockRenders(page, {
    answers: [
      { status: 'rendering', progress: 64 },
      { status: 'rendering', progress: 64 },
    ],
  });
  await openExport(page);
  await page.getByRole('button', { name: 'Export video' }).click();
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '64');
  await page.waitForTimeout(1_500);
  await save(page, 'export-progress');
  // The top-bar button shows the render (R4.4).
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: /Rendering 64%/ })).toBeVisible();
  await page.waitForTimeout(600);
  await save(page, 'export-progress-closed');
  expect(errors).toEqual([]);
});

test('export dialog error state', async ({ page }) => {
  const errors = trackPageErrors(page);
  await mockRenders(page, {
    answers: [
      { status: 'rendering', progress: 30 },
      { status: 'error', progress: 30, error: 'render-failed' },
    ],
  });
  await openExport(page);
  await page.getByRole('button', { name: 'Export video' }).click();
  await expect(page.getByText("That one didn't make it")).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(1_000);
  await save(page, 'export-error');
  expect(errors).toEqual([]);
});

test('ready dialog matches export-ready.png', async ({ page }) => {
  const errors = trackPageErrors(page);
  await mockRenders(page, { answers: [{ status: 'done', progress: 100 }] });
  await openExport(page);
  await page.getByRole('button', { name: 'Export video' }).click();
  await expect(page.getByRole('heading', { level: 3, name: 'Your video is ready' })).toBeVisible({
    timeout: 10_000,
  });
  // The entry spring, the confetti pop-ins and Pip's celebration settle.
  await page.waitForTimeout(2_500);
  const ready = page.getByRole('dialog');
  const rbox = await ready.boundingBox();
  expect(Math.round(rbox?.width ?? 0)).toBe(560);
  expect(Math.round(rbox?.height ?? 0)).toBe(638);
  expect(Math.round(rbox?.y ?? 0)).toBe(131);
  await expectSize(page.getByRole('button', { name: 'Download video' }), 496, 48, 'download');
  await expectSize(page.getByRole('button', { name: 'Copy share link' }), 496, 44, 'copy link');
  const shot = await save(page, 'export-ready');
  const pct = compare('export-ready', shot, READY_BOX);
  writeFileSync(
    path.join(OUT, 'export-ready.report.json'),
    JSON.stringify({ diffPct: pct }, null, 2),
  );
  console.log(`ready dialog diff: ${pct.toFixed(2)} %`);
  expect(pct).toBeLessThanOrEqual(MAX_DIFF_PCT['export-ready']);
  expect(errors).toEqual([]);
});

test('export dialog in 9:16 letterboxes the still', async ({ page }) => {
  const errors = trackPageErrors(page);
  await openExport(page);
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('radio', { name: '9:16' }).click();
  await dialog.getByRole('radio', { name: '720p' }).click();
  await expect(dialog.getByRole('radio', { name: '9:16' })).toHaveAttribute('aria-checked', 'true');
  await page.waitForTimeout(2_000);
  // The still keeps its 192×108 box and shows the vertical frame inside it.
  await expectSize(dialog.getByTestId('video-still'), 192, 108, 'thumbnail box');
  await save(page, 'export-9x16-720p');
  expect(errors).toEqual([]);
});
