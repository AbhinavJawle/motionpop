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

/** Session usage events the design check feeds into the chart (dev builds expose the recorder). */
const SAMPLE_EVENTS = [
  ...Array.from({ length: 7 }, (_, i) => ({
    ranOn: 'device',
    ok: true,
    latencyMs: 280 + i * 40,
    cloudCost: i % 2 ? 1 : 3,
  })),
  ...Array.from({ length: 3 }, (_, i) => ({
    ranOn: 'cloud',
    ok: true,
    latencyMs: 1800 + i * 300,
    cloudCost: 3,
  })),
];

async function feedUsage(page: import('@playwright/test').Page) {
  await page.waitForFunction(() => '__recordSessionUsage' in window);
  await page.evaluate((events) => {
    const record = (window as unknown as { __recordSessionUsage: (e: object) => void })
      .__recordSessionUsage;
    events.forEach((e, i) =>
      record({
        id: `design-event-${i}`,
        task: 'edit.patch',
        model: 'm',
        credits: e.ranOn === 'cloud' ? 3 : 0,
        attempts: 1,
        clientAt: 1,
        ...e,
      }),
    );
  }, SAMPLE_EVENTS);
}

test('/settings page: each section', async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  const errors = trackPageErrors(page);
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Make it yours.' })).toBeVisible();
  await feedUsage(page);
  await expect(page.getByTestId('usage-chart')).toBeVisible();
  await page.waitForTimeout(900); // bars grow in

  // Layout (spec 35): the 760 px column and the 200 px index at 1440.
  const column = await page.getByTestId('settings-column').boundingBox();
  expect(Math.round(column?.width ?? 0)).toBe(760);
  const nav = await page.getByRole('navigation', { name: 'Settings sections' }).boundingBox();
  expect(Math.round(nav?.width ?? 0)).toBe(200);
  await expect(page.getByRole('link', { name: 'Account', exact: true })).toHaveAttribute(
    'aria-current',
    'true',
  );

  await page.screenshot({ path: path.join(OUT, 'settings.page.png') });
  for (const id of ['account', 'ai', 'credits']) {
    await page.locator(`#${id}`).screenshot({ path: path.join(OUT, `settings-${id}.actual.png`) });
  }
  // The usage chart shows both colours and the figures.
  await expect(page.locator('[data-segment="device"]').first()).toBeVisible();
  await expect(page.locator('[data-segment="cloud"]').first()).toBeVisible();
  await expect(page.getByText('This session')).toBeVisible();

  // The credits chip jumps to Credits and the nav follows.
  await page
    .getByRole('button', { name: /credits/i })
    .first()
    .click();
  await expect(page.getByRole('link', { name: 'Credits', exact: true })).toHaveAttribute(
    'aria-current',
    'true',
  );
  expect(errors).toEqual([]);
});

test('editor: Settings in the 340 px left panel', async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  const errors = trackPageErrors(page);
  await openEditor(page, '/editor/demo');
  const timeline = page.locator('[data-time-area]');
  const before = await timeline.boundingBox();
  const previewBefore = await page.getByRole('region', { name: 'Preview' }).boundingBox();
  await page.screenshot({ path: path.join(OUT, 'editor-settings-closed.page.png') });

  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Settings' }).click();
  const panel = page.getByRole('complementary', { name: 'Settings' });
  await expect(panel).toBeVisible();
  await feedUsage(page);
  await page.waitForTimeout(900);
  const box = await panel.boundingBox();
  expect(Math.round(box?.width ?? 0)).toBe(340);
  // The preview shrinks; the timeline never moves (design-system.md "Layout").
  const after = await timeline.boundingBox();
  expect(after).toEqual(before);
  const previewAfter = await page.getByRole('region', { name: 'Preview' }).boundingBox();
  expect(previewAfter?.width ?? 0).toBeLessThan((previewBefore?.width ?? 0) - 300);
  // No rail item shows active while Settings is open (D-13-6).
  for (const b of await page.getByRole('navigation', { name: 'Tools' }).getByRole('button').all()) {
    await expect(b).toHaveAttribute('aria-pressed', 'false');
  }
  await page.screenshot({ path: path.join(OUT, 'editor-settings-panel.page.png') });
  await panel.screenshot({ path: path.join(OUT, 'editor-settings-panel.actual.png') });

  // The credits chip scrolls the panel to Credits.
  await page
    .getByRole('button', { name: /credits/i })
    .first()
    .click();
  await page.waitForTimeout(500);
  await page.getByTestId('settings-panel-body').evaluate((el) => el.scrollTo({ top: 99999 }));
  await page.waitForTimeout(200);
  await panel.screenshot({ path: path.join(OUT, 'editor-settings-panel-credits.actual.png') });

  // Escape closes it and the preview grows back.
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  expect(errors).toEqual([]);
});
