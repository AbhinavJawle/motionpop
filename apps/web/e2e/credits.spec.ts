import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { trackPageErrors } from './helpers';

/**
 * Credits end to end (spec 13 task 17) in the `auth` project: a real account on the Auth and
 * Firestore emulators, the real client (`ServerCredits` → `/api/credits/*` → ledger → live
 * balance), the Settings page and the out-of-credits modal.
 *
 * Deviations from the task text, because spec 09's screens do not exist yet: no screen spends
 * credits, so the spend and the refund are driven through the dev-only `window.__credits` hook
 * (the real `ServerCredits` plus the UI glue); there is no quick-edit chip to flip, so the
 * "Prefer on-device AI" switch is checked against what it saves; and `NEXT_PUBLIC_FAKE_AI` is
 * **not** set on this server, because fake AI means local credits (spec 09's table) and this
 * test is about the server's balance.
 */
const EMULATOR = 'http://127.0.0.1:9099';
const FIRESTORE = 'http://127.0.0.1:8080';
const PROJECT = 'motionpop-48409';
const DOCS = `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents`;
const OWNER = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const HERE = path.dirname(fileURLToPath(import.meta.url));
const DESIGN_OUT = path.resolve(HERE, '../e2e-output/design');

test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });

async function clearEmulators(): Promise<void> {
  const auth = await fetch(`${EMULATOR}/emulator/v1/projects/${PROJECT}/accounts`, {
    method: 'DELETE',
  });
  const db = await fetch(
    `${FIRESTORE}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`,
    { method: 'DELETE' },
  );
  expect(auth.ok && db.ok).toBe(true);
}

async function uidFor(email: string): Promise<string> {
  const res = await fetch(
    `${EMULATOR}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:lookup`,
    { method: 'POST', headers: OWNER, body: JSON.stringify({ email: [email] }) },
  );
  const uid = ((await res.json()) as { users?: { localId: string }[] }).users?.[0]?.localId;
  if (!uid) throw new Error(`no emulator account for ${email}`);
  return uid;
}

interface Field {
  integerValue?: string;
  stringValue?: string;
  booleanValue?: boolean;
  mapValue?: { fields: Record<string, Field> };
}
async function readDoc(docPath: string): Promise<Record<string, Field> | null> {
  const res = await fetch(`${DOCS}/${docPath}`, { headers: OWNER });
  if (res.status === 404) return null;
  return ((await res.json()) as { fields: Record<string, Field> }).fields;
}
async function setCredits(uid: string, credits: number): Promise<void> {
  const res = await fetch(`${DOCS}/users/${uid}?updateMask.fieldPaths=credits`, {
    method: 'PATCH',
    headers: OWNER,
    body: JSON.stringify({ fields: { credits: { integerValue: String(credits) } } }),
  });
  expect(res.ok).toBe(true);
}

async function signUp(page: Page, email: string): Promise<void> {
  await page.goto('/editor/demo');
  await expect(page).toHaveURL(/\/sign-in\?next=%2Feditor%2Fdemo$/);
  await page.getByRole('button', { name: 'Create an account' }).click();
  await page.getByPlaceholder('Email').fill(email);
  await page.getByPlaceholder(/^Password/).fill('voice-first-123');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/editor\/demo$/, { timeout: 30_000 });
  await expect(page.locator('[data-slot-id]').first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('button', { name: '20 credits' })).toBeVisible({ timeout: 30_000 });
}

type CreditsHook = {
  spend: (req: {
    action: string;
    key: string;
  }) => Promise<{ ok: boolean; reason?: string; txId?: string; balance?: number } | null>;
  refund: (txId: string) => Promise<void>;
  balance: () => number | null;
};
const hook = (page: Page) => page.waitForFunction(() => '__credits' in window);
const spend = (page: Page, key: string) =>
  page.evaluate(
    (k) =>
      (window as unknown as { __credits: CreditsHook }).__credits.spend({
        action: 'generate',
        key: k,
      }),
    key,
  );

/** The ledger rows of Settings, as "Reason + delta" text without the time. */
async function ledgerRows(page: Page): Promise<string[]> {
  const rows = page.getByTestId('ledger-row');
  const out: string[] = [];
  for (const r of await rows.all()) {
    const [reason, delta] = await Promise.all([
      r.locator('span.truncate').innerText(),
      r.locator('span.font-mono').innerText(),
    ]);
    out.push(`${reason} ${delta}`);
  }
  return out;
}

test.describe('Credits (emulators, real client)', () => {
  test.beforeEach(clearEmulators);

  test('sign up → welcome row → spend → refund → out of credits → preference → usage', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const errors = trackPageErrors(page);
    await signUp(page, 'creator@example.com');
    const uid = await uidFor('creator@example.com');

    // Settings: the Free plan, the allowance line and the Welcome credits row.
    await page.goto('/settings');
    await expect(page.getByTestId('plan-chip')).toHaveText('Free', { timeout: 30_000 });
    await expect(page.getByTestId('plan-line')).toHaveText('Free plan · 20 credits on sign-up');
    await expect(page.getByTestId('account-name')).toHaveText('creator');
    await expect.poll(() => ledgerRows(page)).toEqual(['Welcome credits +20']);
    await expect(page.getByRole('button', { name: '20 credits' }).first()).toBeVisible();
    await expect(page.getByRole('switch', { name: 'Prefer on-device AI' })).toHaveAttribute(
      'aria-checked',
      'true',
    );

    // A Generate-priced spend through the real client: 17, and a debit row.
    await hook(page);
    const first = await spend(page, 'e2ekey000000001');
    expect(first).toMatchObject({ ok: true, balance: 17, txId: 's-e2ekey000000001' });
    await expect(page.getByRole('button', { name: '17 credits' }).first()).toBeVisible({
      timeout: 15_000,
    });
    await page.reload();
    await expect(page.getByRole('button', { name: '17 credits' }).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect
      .poll(() => ledgerRows(page))
      .toEqual(['Generated a graphic \u22123', 'Welcome credits +20']);

    // The AI call "failed": the refund brings it back, with a Refund row.
    await hook(page);
    await page.evaluate(() =>
      (window as unknown as { __credits: CreditsHook }).__credits.refund('s-e2ekey000000001'),
    );
    await expect(page.getByRole('button', { name: '20 credits' }).first()).toBeVisible({
      timeout: 15_000,
    });
    await page.reload();
    await expect
      .poll(() => ledgerRows(page))
      .toEqual(['Refund +3', 'Generated a graphic \u22123', 'Welcome credits +20']);
    // The refunded key can never be spent again with the same id (the client takes a fresh key).
    const again = await spend(page, 'e2ekey000000001');
    expect(again?.ok).toBe(true);
    expect(again?.txId).not.toBe('s-e2ekey000000001');
    await expect(page.getByRole('button', { name: '17 credits' }).first()).toBeVisible({
      timeout: 15_000,
    });

    // Signed-in Settings screenshots at 1440×900 (@2x).
    mkdirSync(DESIGN_OUT, { recursive: true });
    await page.reload();
    await expect(page.getByTestId('ledger-row').first()).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: path.join(DESIGN_OUT, 'settings-signed-in.page.png') });
    await page
      .locator('#credits')
      .screenshot({ path: path.join(DESIGN_OUT, 'settings-credits-signed-in.actual.png') });

    // Out of credits: balance 2 → the modal opens from the pre-check and nothing is charged.
    await setCredits(uid, 2);
    await expect(page.getByRole('button', { name: '2 credits' }).first()).toBeVisible({
      timeout: 15_000,
    });
    await hook(page);
    const ledgerBefore = await ledgerRows(page);
    const blocked = await spend(page, 'e2ekey000000002');
    expect(blocked).toBeNull();
    const dialog = page.getByRole('dialog', { name: 'Pip needs a recharge' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId('out-of-credits-cost')).toHaveText(
      '2 available · Generate costs 3',
    );
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(DESIGN_OUT, 'out-of-credits-signed-in.page.png') });
    await dialog.getByRole('button', { name: 'Keep editing' }).click();
    await expect(dialog).toBeHidden();
    expect((await readDoc(`users/${uid}`))?.['credits']?.integerValue).toBe('2');
    expect(await ledgerRows(page)).toEqual(ledgerBefore);
    await setCredits(uid, 17);

    // "Prefer on-device AI": the switch saves to the account and survives a reload.
    const toggle = page.getByRole('switch', { name: 'Prefer on-device AI' });
    await toggle.click();
    await expect
      .poll(
        async () =>
          (await readDoc(`users/${uid}`))?.['settings']?.mapValue?.fields['preferOnDevice']
            ?.booleanValue,
      )
      .toBe(false);
    await page.reload();
    await expect(page.getByRole('switch', { name: 'Prefer on-device AI' })).toHaveAttribute(
      'aria-checked',
      'false',
      { timeout: 30_000 },
    );

    // Usage: events go through the real reporter and `/api/usage`, and the chart shows both colours.
    await page.waitForFunction(() => '__emitUsage' in window);
    await page.evaluate(() => {
      const emit = (window as unknown as { __emitUsage: (e: object) => void }).__emitUsage;
      for (let i = 0; i < 3; i++)
        emit({
          task: 'edit.patch',
          ranOn: 'device',
          model: 'nano',
          credits: 0,
          cloudCost: 1,
          latencyMs: 300 + i,
          ok: true,
        });
      emit({
        task: 'component.fill',
        ranOn: 'cloud',
        model: 'flash',
        credits: 3,
        cloudCost: 3,
        latencyMs: 2200,
        ok: true,
      });
      // Flush as if the page were hidden (keepalive, cached headers).
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    const day = new Date().toISOString().slice(0, 10);
    await expect
      .poll(
        async () => (await readDoc(`users/${uid}/limits/${day}`))?.['usageEvents']?.integerValue,
        { timeout: 20_000 },
      )
      .toBe('4');
    await page.goto('/settings');
    await expect(page.locator('[data-segment="device"]').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('[data-segment="cloud"]').first()).toBeVisible();
    await expect(page.getByText('calls ran on your device')).toBeVisible();
    await expect(
      page.getByTestId('usage-chart').getByText('3', { exact: true }).first(),
    ).toBeVisible();
    await expect(page.getByText('Last 14 days')).toBeVisible();
    await page.waitForTimeout(900);
    await page
      .locator('#ai')
      .screenshot({ path: path.join(DESIGN_OUT, 'settings-ai-signed-in.actual.png') });

    expect(errors).toEqual([]);
  });

  test('the editor chip is the live balance and opens Settings at Credits', async ({ page }) => {
    const errors = trackPageErrors(page);
    await signUp(page, 'chip@example.com');
    await page.getByRole('button', { name: '20 credits' }).click();
    const panel = page.getByRole('complementary', { name: 'Settings' });
    await expect(panel).toBeVisible();
    await expect(panel.getByText('Welcome credits')).toBeVisible({ timeout: 30_000 });
    await page.screenshot({
      path: path.join(DESIGN_OUT, 'editor-settings-panel-signed-in.page.png'),
    });
    expect(errors).toEqual([]);
  });
});
