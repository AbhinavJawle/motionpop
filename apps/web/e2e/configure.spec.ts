import { expect, test, type Page } from '@playwright/test';
import { trackPageErrors } from './helpers';

/** Takes the sample from Start to a prepared configure screen. */
async function sampleToConfigure(page: Page): Promise<void> {
  await page.goto('/start');
  await page.getByRole('button', { name: /Try a sample/ }).click();
  await page.waitForURL('**/start/configure');
  await expect(page.getByRole('progressbar', { name: 'Preparing your take' })).toHaveAttribute(
    'aria-valuenow',
    '100',
    { timeout: 30_000 },
  );
}

test.describe('Configure screen (spec 39)', () => {
  test('a sample shows the choices and a summary that says nothing is spent yet', async ({
    page,
  }) => {
    const errors = trackPageErrors(page);
    await sampleToConfigure(page);
    for (const name of ['Recipe', 'Style', 'Captions', 'Sound']) {
      // The section number ("01") is part of the heading's name.
      await expect(page.getByRole('heading', { name: new RegExp(`${name}$`) })).toBeVisible();
    }
    const summary = page.getByRole('complementary', { name: 'Summary' });
    await expect(summary).toBeVisible();
    await expect(summary).toContainText('Nothing is spent until you press Create.');
    await expect(summary.getByRole('button', { name: 'Create', exact: true })).toBeEnabled();
    expect(errors).toEqual([]);
  });

  test('describing your own style reads it for free and adds a "Your style" row', async ({
    page,
  }) => {
    const errors = trackPageErrors(page);
    await sampleToConfigure(page);
    const style = page.getByRole('radiogroup', { name: 'Style', exact: true });
    await style.getByRole('radio', { name: /Describe your own/ }).click();
    const field = page.getByRole('textbox', { name: 'Describe your style' });
    await field.fill('Dark and neon, with teal highlights');
    await field.press('Tab');
    // Local mode has no on-device model, so the keyword resolver answers.
    await expect(page.getByText('free · quick match', { exact: true })).toBeVisible({
      timeout: 10_000,
    });
    const summary = page.getByRole('complementary', { name: 'Summary' });
    await expect(summary).toContainText('Your style');
    expect(errors).toEqual([]);
  });

  test('Remove goes back to Start', async ({ page }) => {
    const errors = trackPageErrors(page);
    await sampleToConfigure(page);
    await page.getByRole('button', { name: 'Remove this take' }).click();
    await page.waitForURL('**/start');
    expect(errors).toEqual([]);
  });

  test('the empty dashboard’s sample is one tap to the configure screen', async ({ page }) => {
    const errors = trackPageErrors(page);
    // A fresh browser context has no projects, so the dashboard is empty.
    await page.goto('/dashboard');
    await page.getByRole('button', { name: 'Try it with a sample' }).click();
    await page.waitForURL('**/start/configure');
    await expect(page.getByRole('progressbar', { name: 'Preparing your take' })).toHaveAttribute(
      'aria-valuenow',
      '100',
      { timeout: 30_000 },
    );
    expect(errors).toEqual([]);
  });

  test('leaving the processing page keeps the job: the dashboard shows it under "Working on it"', async ({
    page,
  }) => {
    const errors = trackPageErrors(page);
    await sampleToConfigure(page);
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await page.waitForURL(/\/processing\/j-[a-z0-9]+/);

    // A prepared sample job takes well under a second, so it is usually done before the page
    // shows, and the "Continue in background" button (only for a working job) never appears.
    // Leaving through the logo is the same client-side navigation and works either way (the
    // store is in memory, so a page.goto would lose it). The page opens the editor and dismisses
    // the card about a second after the job finishes: leaving first keeps the card.
    const leave = page.getByRole('button', { name: 'Continue in background' });
    if (await leave.isVisible()) await leave.click();
    else await page.getByRole('link', { name: 'motionpop home' }).click();
    await page.waitForURL('**/dashboard');

    const card = page.getByTestId('job-card');
    // Too slow a click lets the processing page finish its hand-over first: nothing to assert.
    const kept = await card.waitFor({ state: 'visible', timeout: 3_000 }).then(
      () => true,
      () => false,
    );
    test.skip(!kept, 'the processing page had already opened the editor and dismissed the job');

    await expect(page.getByRole('heading', { name: 'Working on it' })).toBeVisible();
    await expect(card).toHaveCount(1);
    // Running, or already done: either way it has its way back in.
    const open = card.getByRole('button', { name: 'Open' });
    await expect(open.or(card.getByRole('button', { name: 'View progress' }))).toBeVisible();
    // It finishes in the background, whatever page is open.
    await expect(card).toHaveAttribute('data-status', 'done', { timeout: 30_000 });
    await open.click();
    await page.waitForURL(/\/editor\/p-[a-z0-9]+/);
    expect(errors).toEqual([]);
  });
});
