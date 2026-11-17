import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { openEditor, trackPageErrors } from './helpers';

/**
 * Film mode end to end with the fake router (spec 07b R5): the button shows its cost, the film
 * is storyboarded and built, every beat passes through the sandboxed critic, the video's
 * graphics are replaced in one step, the credits are spent once, and Undo brings the old
 * graphics back. Screenshots go to `e2e-output/design/`.
 */
test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../e2e-output/design');

test('Make it a film: progress, the film, one undo', async ({ page }) => {
  const errors = trackPageErrors(page);
  await openEditor(page, '/editor/demo?fakeLatency=600');
  await page.evaluate(() => document.fonts.ready);
  const credits = page.getByRole('button', { name: /^\d+ credits$/ });
  await expect(credits).toHaveAccessibleName('120 credits');
  const before = await page.locator('[data-slot-id]').count();
  expect(before).toBeGreaterThan(0);

  const make = page.getByRole('button', { name: /Make it a film/ });
  await expect(make).toBeVisible();
  await make.click();
  await expect(
    page.getByRole('status').filter({ hasText: /storyboarding|Building beat/ }),
  ).toBeVisible();
  mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, 'film-busy.png'), animations: 'disabled' });

  await expect(page.getByText(/^Your film is ready/)).toBeVisible({ timeout: 60_000 });
  // The demo voiceover is under 30 s: one unit, 5 credits, spent once.
  await expect(credits).toHaveAccessibleName('115 credits');
  const film = page.locator('[data-slot-id^="film-"]');
  await expect(film.first()).toBeVisible();
  expect(await film.count()).toBeGreaterThan(1);
  await expect(page.locator('[data-slot-id]:not([data-slot-id^="film-"])')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Remake the film/ })).toBeVisible();
  await page.waitForTimeout(1_200);
  await page.screenshot({ path: path.join(OUT, 'film-done.png'), animations: 'disabled' });

  // One undo step brings every old graphic back.
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('[data-slot-id^="film-"]')).toHaveCount(0);
  await expect(page.locator('[data-slot-id]')).toHaveCount(before);
  expect(errors).toEqual([]);
});
