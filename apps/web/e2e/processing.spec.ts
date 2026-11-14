import { expect, test } from '@playwright/test';
import { trackPageErrors, wordsTrack } from './helpers';

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
    expect(states).toEqual(['done', 'done', 'skipped', 'skipped']);

    await page.waitForURL(/\/editor\/p-[a-z0-9]+/, { timeout: 15_000 });
    console.log(`processing: editor reached after ${Date.now() - t0} ms`);
    const editorUrl = page.url();
    await expect(page.getByText('Voiceover · 14.3s')).toBeVisible({ timeout: 30_000 });
    await expect(wordsTrack(page).getByRole('button')).toHaveCount(22);

    await page.reload();
    expect(page.url()).toBe(editorUrl);
    await expect(page.getByText('Voiceover · 14.3s')).toBeVisible({ timeout: 30_000 });
    await expect(wordsTrack(page).getByRole('button')).toHaveCount(22);
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
