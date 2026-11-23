import { expect, test, type Page } from '@playwright/test';
import { boxOf, slotCard, trackPageErrors, wordsTrack } from './helpers';

test.describe('Processing screen', () => {
  test('new shows the drop zone and rejects a non-audio file', async ({ page }) => {
    const errors = trackPageErrors(page);
    await page.goto('/processing/new');
    await expect(
      page.getByRole('button', { name: /Drop a video or voiceover here/ }),
    ).toBeVisible();
    await page.locator('input[type=file]').setInputFiles({
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('definitely not audio'),
    });
    await expect(page.getByText(/doesn.t look like audio/)).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('Try a sample ends in the editor and survives a reload', async ({ page }) => {
    const errors = trackPageErrors(page);
    await page.goto('/processing/new');
    const t0 = Date.now();
    await page.getByRole('button', { name: /Try a sample/ }).click();

    const steps = page.getByRole('list', { name: 'Processing steps' });
    await expect(steps).toContainText('Sample transcript · 22 words · 18.0s', { timeout: 15_000 });
    await expect(steps).toContainText('Removed 4 long pauses', { timeout: 15_000 });
    await expect(steps).toContainText('Planned with built-in rules', { timeout: 15_000 });
    const states = await steps.locator('li').evaluateAll((els) => els.map((e) => e.dataset.state));
    console.log(`processing: steps ${states.join(',')} after ${Date.now() - t0} ms`);
    // Changed by spec 07 task 27: a fifth step, the director ("Planning the video"). Local mode
    // has no model, so the built-in rules plan it.
    expect(states).toEqual(['done', 'done', 'done', 'done', 'done']);
    await expect(steps).toContainText('Found 3 moments');
    // Changed by spec 07 task 27: the opening line is a hook-statement draft (suggested) and the
    // number a ready stat-punch (was one ready big-number). Since 4f59e89 (graphics cover the
    // whole voiceover) the closing clause is a third, low-ranked hook.
    await expect(steps).toContainText('3 slots found');
    const stripCards = page.getByTestId('strip-slots').locator('span[data-status]');
    await expect(stripCards).toHaveCount(3);
    await expect(stripCards.first()).toHaveAttribute('data-status', 'suggested');
    await expect(stripCards.nth(1)).toHaveAttribute('data-status', 'ready');
    await expect(page.getByTestId('pip-bubble')).toHaveText(/3 slots ready/);

    await page.waitForURL(/\/editor\/p-[a-z0-9]+/, { timeout: 15_000 });
    console.log(`processing: editor reached after ${Date.now() - t0} ms`);
    const editorUrl = page.url();
    await expectSuggestedSlot(page);

    await page.reload();
    expect(page.url()).toBe(editorUrl);
    await expectSuggestedSlot(page);
    expect(errors).toEqual([]);
  });

  test('an unknown id says the upload was interrupted', async ({ page }) => {
    const errors = trackPageErrors(page);
    await page.goto('/processing/does-not-exist');
    await expect(page.getByText('This upload was interrupted')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Choose another file' })).toBeVisible();
    expect(errors).toEqual([]);
  });
});

/**
 * Editor shows the voiceover, 22 words, the opening hook (filled with its safe default by
 * auto-fill when no device model answers) and the ready stat-punch over "revenue … percent".
 */
async function expectSuggestedSlot(page: Page): Promise<void> {
  await expect(page.getByText('Voiceover · 14.3s')).toBeVisible({ timeout: 30_000 });
  await expect(wordsTrack(page).getByRole('button')).toHaveCount(22);
  await expect(page.locator('[data-slot-id]')).toHaveCount(3, { timeout: 30_000 });
  const ids = await page
    .locator('[data-slot-id]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-slot-id') as string));
  const hook = slotCard(page, ids[0] as string);
  const stat = slotCard(page, ids[1] as string);
  await expect(hook).toContainText('Hook statement');
  await expect(hook).toHaveAttribute('data-status', 'ready', { timeout: 30_000 });
  await expect(stat).toHaveAttribute('data-status', 'ready');
  await expect(stat).toContainText('Stat punch');
  await expect(stat).toContainText('40%');

  const words = wordsTrack(page);
  const our = await boxOf(words.getByRole('button', { name: 'Our', exact: true }));
  const revenue = await boxOf(words.getByRole('button', { name: 'revenue', exact: true }));
  const percent = await boxOf(words.getByRole('button', { name: 'percent', exact: true }));
  const slot = await boxOf(stat);
  const centre = (b: { x: number; width: number }) => b.x + b.width / 2;
  // Leads in from "revenue" (the first word 0.9 s before "forty"), not "Our", and covers "percent".
  expect(slot.x).toBeGreaterThan(centre(our));
  expect(slot.x).toBeLessThanOrEqual(centre(revenue));
  expect(slot.x + slot.width).toBeGreaterThanOrEqual(centre(percent));
}
