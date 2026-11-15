import { expect, test, type Page } from '@playwright/test';
import { boxOf, slotCard, trackPageErrors, wordsTrack } from './helpers';

test.describe('Processing screen', () => {
  test('new shows the drop zone and rejects a non-audio file', async ({ page }) => {
    const errors = trackPageErrors(page);
    await page.goto('/processing/new');
    await expect(page.getByRole('button', { name: /Drop a voiceover here/ })).toBeVisible();
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
    const states = await steps.locator('li').evaluateAll((els) => els.map((e) => e.dataset.state));
    console.log(`processing: steps ${states.join(',')} after ${Date.now() - t0} ms`);
    expect(states).toEqual(['done', 'done', 'done', 'done']);
    await expect(steps).toContainText('Found 3 moments');
    await expect(steps).toContainText('1 slot found');
    const stripCards = page.getByTestId('strip-slots').locator('span[data-status]');
    await expect(stripCards).toHaveCount(1);
    await expect(stripCards.first()).toHaveAttribute('data-status', 'ready');
    await expect(page.getByTestId('pip-bubble')).toHaveText(/1 slot ready/);

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

/** Editor shows the voiceover, 22 words and exactly one ready slot over "Our … percent". */
async function expectSuggestedSlot(page: Page): Promise<void> {
  await expect(page.getByText('Voiceover · 14.3s')).toBeVisible({ timeout: 30_000 });
  await expect(wordsTrack(page).getByRole('button')).toHaveCount(22);
  await expect(page.locator('[data-slot-id]')).toHaveCount(1, { timeout: 30_000 });
  const id = await page.locator('[data-slot-id]').first().getAttribute('data-slot-id');
  const card = slotCard(page, id as string);
  await expect(card).toHaveAttribute('data-status', 'ready');
  await expect(card).toContainText('Big number');
  await expect(card).toContainText('40%');

  const words = wordsTrack(page);
  const our = await boxOf(words.getByRole('button', { name: 'Our', exact: true }));
  const percent = await boxOf(words.getByRole('button', { name: 'percent', exact: true }));
  const since = await boxOf(words.getByRole('button', { name: 'since', exact: true }));
  const slot = await boxOf(card);
  const centre = (b: { x: number; width: number }) => b.x + b.width / 2;
  // Starts at "Our" (not after its centre), covers "percent", stops within "since" (never reaches the word after).
  expect(slot.x).toBeLessThanOrEqual(centre(our));
  expect(slot.x + slot.width).toBeGreaterThanOrEqual(centre(percent));
  expect(slot.x + slot.width).toBeLessThanOrEqual(since.x + since.width);
}
