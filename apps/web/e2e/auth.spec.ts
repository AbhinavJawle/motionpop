import { expect, test, type Page } from '@playwright/test';
import { trackPageErrors } from './helpers';

const EMULATOR = 'http://127.0.0.1:9099';
const FIRESTORE = 'http://127.0.0.1:8080';
const PROJECT = 'motionpop-48409';
const DOCS = `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents`;
// "owner" bypasses security rules on the emulators.
const OWNER = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };

/** Wipe emulator accounts and documents so every run starts clean. */
async function clearEmulators(): Promise<void> {
  const auth = await fetch(`${EMULATOR}/emulator/v1/projects/${PROJECT}/accounts`, {
    method: 'DELETE',
  });
  const db = await fetch(
    `${FIRESTORE}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`,
    {
      method: 'DELETE',
    },
  );
  expect(auth.ok && db.ok).toBe(true);
}

/** Uid of the emulator account with this email. */
async function uidFor(email: string): Promise<string> {
  const res = await fetch(
    `${EMULATOR}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:lookup`,
    {
      method: 'POST',
      headers: OWNER,
      body: JSON.stringify({ email: [email] }),
    },
  );
  const body = (await res.json()) as { users?: { localId: string }[] };
  const uid = body.users?.[0]?.localId;
  if (!uid) throw new Error(`no emulator account for ${email}`);
  return uid;
}

type Fields = Record<string, { integerValue?: string; stringValue?: string }>;

/** Firestore REST document fields, or null when the doc doesn't exist. */
async function readDoc(path: string): Promise<Fields | null> {
  const res = await fetch(`${DOCS}/${path}`, { headers: OWNER });
  if (res.status === 404) return null;
  return ((await res.json()) as { fields: Fields }).fields;
}

/** Wait for the bootstrap route to write `users/{uid}`. */
async function userDoc(email: string): Promise<Fields> {
  const uid = await uidFor(email);
  let doc: Fields | null = null;
  await expect
    .poll(async () => (doc = await readDoc(`users/${uid}`)) !== null, { timeout: 15_000 })
    .toBe(true);
  return doc as unknown as Fields;
}

async function fill(page: Page, email: string, password?: string): Promise<void> {
  await page.getByPlaceholder('Email').fill(email);
  if (password !== undefined) await page.getByPlaceholder(/^Password/).fill(password);
}

test.describe('Sign in (Auth emulator)', () => {
  test.beforeEach(clearEmulators);

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

    // First sign-in bootstraps the account: free plan, 20 credits, one signup ledger entry.
    const user = await userDoc('creator@example.com');
    expect(user.plan?.stringValue).toBe('free');
    expect(user.credits?.integerValue).toBe('20');
    const uid = await uidFor('creator@example.com');
    const tx = await readDoc(`users/${uid}/credits/signup`);
    expect(tx?.reason?.stringValue).toBe('signup');
    expect(tx?.balanceAfter?.integerValue).toBe('20');

    await page.goto('/dashboard');
    // Changed by spec 11 task 10: the real dashboard greets by first name ("there" without a
    // display name) and Sign out lives in the avatar menu.
    await expect(page.getByTestId('dashboard-title')).toHaveText(/, there\??$/);
    await page.getByRole('button', { name: 'Account menu' }).click();
    await page.getByRole('menuitem', { name: 'Sign out' }).click();
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

  test('a verified allow-listed email gets the judge plan', async ({ page }) => {
    // The judge account exists and is verified before its first sign-in (as we'd set it up).
    const signUp = await fetch(
      `${EMULATOR}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts`,
      {
        method: 'POST',
        headers: OWNER,
        body: JSON.stringify({
          email: 'judge@example.com',
          password: 'judge-pass-123',
          emailVerified: true,
        }),
      },
    );
    expect(signUp.ok).toBe(true);

    await page.goto('/sign-in?next=%2Fdashboard');
    await fill(page, 'judge@example.com', 'judge-pass-123');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30_000 });
    const judge = await userDoc('judge@example.com');
    expect(judge.plan?.stringValue).toBe('judge');
    expect(judge.credits?.integerValue).toBe('500');
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
