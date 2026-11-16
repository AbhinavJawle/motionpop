import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { openEditor, trackPageErrors } from './helpers';

/**
 * Screenshots of the inspector at 1440×900 for the design check (spec 09 tasks 12 to 16): a slot
 * selected, a quick edit working, the quick edit done with "Ready in X.Xs", and the versions
 * strip. They are written to `e2e-output/design/` to be laid next to `editor.png`; the spec only
 * asserts what the screens show (the numbers of the pixel diff live in `editor-design.spec.ts`).
 */
test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../e2e-output/design');
const inspector = (page: Page) => page.locator('aside[aria-label="Graphic inspector"] > div');

async function shot(page: Page, name: string): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, `${name}.png`), animations: 'disabled' });
}

test('inspector with a slot selected, a quick edit working and done, and the versions strip', async ({
  page,
}) => {
  const errors = trackPageErrors(page);
  // React warnings (duplicate keys, bad props) are console errors, not page errors.
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 300)}`);
  });
  // A slow fake model, so the "working" state can be looked at.
  await openEditor(page, '/editor/demo?t=5600&select=slot-2&fakeLatency=4000');
  await page.evaluate(() => document.fonts.ready);
  await expect(page.getByLabel('Current time')).toHaveText('00:05.6');
  await page.waitForTimeout(2_000);
  await shot(page, 'inspector-selected');

  const quick = page.locator('[data-quick-edit-input]');
  await expect(quick).toBeEnabled();
  await quick.fill('make it slower');
  await quick.press('Enter');
  await expect(page.locator('[aria-busy="true"]')).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Pip is thinking…' })).toBeVisible();
  await page.waitForTimeout(300);
  await shot(page, 'inspector-quick-edit-busy');

  await expect(page.getByText(/^Ready in \d+\.\ds$/)).toBeVisible({ timeout: 15_000 });
  await expect(quick).toHaveValue('');
  await page.waitForTimeout(700);
  await shot(page, 'inspector-quick-edit-done');

  // The new version is the current one: v4 with "make it slower" as its label.
  await inspector(page).evaluate((el) => (el.scrollTop = el.scrollHeight));
  await expect(page.getByLabel('Current version v4')).toBeVisible();
  await expect(page.getByRole('button', { name: 'make it slower (current)' })).toBeVisible();
  await page.waitForTimeout(300);
  await shot(page, 'inspector-versions');

  expect(errors).toEqual([]);
});
