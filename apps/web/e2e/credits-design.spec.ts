import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { openEditor, trackPageErrors } from './helpers';

/**
 * Design check of the credits screens that have no PNG (spec 13 task 18, Kiro half): the
 * out-of-credits modal over the editor at 1440×900 (scale 2), saved under `e2e-output/design/`
 * for a side-by-side review with `design/screens/export.png` (backdrop, radius, title, button).
 * No pixel threshold: there is no reference. The assertions pin the copy and the geometry.
 */
test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '../e2e-output/design');

test('out-of-credits modal over the editor', async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  const errors = trackPageErrors(page);
  await openEditor(page, '/editor/demo');
  await page.waitForFunction(() => '__openOutOfCredits' in window);
  await page.evaluate(() => {
    (window as unknown as { __openOutOfCredits: (i: object) => void }).__openOutOfCredits({
      action: 'generate',
      cost: 3,
      balance: 0,
    });
  });
  const dialog = page.getByRole('dialog', { name: 'Pip needs a recharge' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId('out-of-credits-cost')).toHaveText(
    '0 available · Generate costs 3',
  );
  // Let the scale-in and Pip's pose settle.
  await page.waitForTimeout(700);
  const box = await dialog.boundingBox();
  expect(Math.round(box?.width ?? 0)).toBe(440);
  await page.screenshot({ path: path.join(OUT, 'out-of-credits.page.png') });
  await dialog.screenshot({ path: path.join(OUT, 'out-of-credits.actual.png') });

  await dialog.getByRole('button', { name: 'Keep editing' }).click();
  await expect(dialog).toBeHidden();
  expect(errors).toEqual([]);
});
