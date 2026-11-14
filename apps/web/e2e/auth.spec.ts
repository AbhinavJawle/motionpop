import { expect, test, type Page } from '@playwright/test';
import { trackPageErrors } from './helpers';

const EMULATOR = 'http://127.0.0.1:9099';
const PROJECT = 'motionpop-48409';

/** Wipe emulator accounts so every run starts clean. */
async function clearAccounts(): Promise<void> {
  const res = await fetch(`${EMULATOR}/emulator/v1/projects/${PROJECT}/accounts`, {
    method: 'DELETE',
  });
  expect(res.ok).toBe(true);
}

async function fill(page: Page, email: string, password?: string): Promise<void> {
  await page.getByPlaceholder('Email').fill(email);
  if (password !== undefined) await page.getByPlaceholder(/^Password/).fill(password);
}

test.describe('Sign in (Auth emulator)', () => {
  test.beforeEach(clearAccounts);

  test('signed-out app routes redirect to sign-in with next', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fdashboard$/);
    await expect(page.getByRole('heading', { name: 'Welcome to Motionpop' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
  });

  test('create account, sign out, sign back in and land on next', async ({ page }) => {
    const errors = trackPageErrors(page);
    await page.goto('/editor/demo');
    await expect(page).toHaveURL(/\/sign-in\?next=%2Feditor%2Fdemo$/);

    await page.getByRole('button', { name: 'Create an account' }).click();
    await fill(page, 'creator@example.com', 'voice-first-123');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page).toHaveURL(/\/editor\/demo$/, { timeout: 30_000 });

    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-title')).toHaveText('Hi, creator@example.com');
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/sign-in/);

    await page.goto('/sign-in?next=%2Fdashboard');
    await fill(page, 'creator@example.com', 'wrong-password');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'don’t match' })).toBeVisible();

    await fill(page, 'creator@example.com', 'voice-first-123');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30_000 });
    expect(errors).toEqual([]);
  });

  test('an unsafe next falls back to the dashboard', async ({ page }) => {
    await page.goto('/sign-in?next=%2F%2Fevil.example');
    await page.getByRole('button', { name: 'Create an account' }).click();
    await fill(page, 'second@example.com', 'voice-first-123');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page).toHaveURL(/127\.0\.0\.1:3201\/dashboard$/, { timeout: 30_000 });
  });

  test('reset password confirms without revealing whether the account exists', async ({ page }) => {
    await page.goto('/sign-in');
    await page.getByRole('button', { name: 'Forgot password?' }).click();
    await fill(page, 'nobody@example.com');
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Check your inbox' })).toBeVisible();
  });
});
