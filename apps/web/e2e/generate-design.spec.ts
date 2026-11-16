import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { openEditor, slotCard, trackPageErrors } from './helpers';

/**
 * Screenshots of Generate at 1440×900 for the design check (spec 09 task 18): the generating
 * panel with a Generate running (compare `editor-generating.png`) and the result (compare
 * `editor.png`), written to `e2e-output/design/`. The spec asserts what the screens show: the
 * panel copy, the slot card phase, the progress line, the badge, the footer, the Pip bubble, the
 * credits (120 → 117) and the new "Generated" version. No pixel thresholds.
 */
test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../e2e-output/design');

async function shot(page: Page, name: string): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, `${name}.png`), animations: 'disabled' });
}

test('Generate: the generating panel, then the result', async ({ page }) => {
  const errors = trackPageErrors(page);
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 300)}`);
  });
  await openEditor(page, '/editor/demo?t=5600&select=slot-2&fakeLatency=4000');
  await page.evaluate(() => document.fonts.ready);
  const credits = page.getByRole('button', { name: /^\d+ credits$/ });
  await expect(credits).toHaveAccessibleName('120 credits');

  await page.getByRole('button', { name: /Generate/ }).click();
  await expect(page.getByText('Bringing it to life')).toBeVisible();
  await expect(page.getByText('Motion in the making')).toBeVisible();
  await expect(page.getByText('Animating slot 2')).toBeVisible();
  await expect(slotCard(page, 'slot-2')).toContainText('Animating…');
  await expect(page.locator('[data-preview-progress]')).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Generating…' })).toBeVisible();
  await expect(page.getByText('Generating motion…')).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Pip is thinking…' })).toBeVisible();
  await page.waitForTimeout(1_500);
  await shot(page, 'generate-busy');

  await expect(page.getByText(/^Ready in \d+\.\ds$/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Bringing it to life')).toHaveCount(0);
  await expect(credits).toHaveAccessibleName('117 credits');
  await page.waitForTimeout(900);
  await shot(page, 'generate-done');

  await expect(page.getByRole('button', { name: /^Generated \(current\)$/ })).toBeVisible();
  expect(errors).toEqual([]);
});
