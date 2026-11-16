import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { trackPageErrors } from './helpers';

/**
 * The export path in emulator mode (spec 08 task 19, review F6): a real account on the Auth
 * emulator, the credits ledger on the Firestore emulator, the voice and the video on the Storage
 * emulator, and the real job entry point (`services/render/src/job.ts`) as a child process of the
 * dev server. It runs in the `auth` project of `playwright.config.ts`, which has the emulators.
 * Needs Java, ffmpeg and a built runtime (`pnpm --filter @motionpop/motion build:runtime`).
 */
const AUTH_URL = 'http://127.0.0.1:3201';
const EMULATOR = 'http://127.0.0.1:9099';
const FIRESTORE = 'http://127.0.0.1:8080';
const PROJECT = 'motionpop-48409';
const DOCS = `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents`;
const OWNER = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '../e2e-output/export');
const DESIGN_OUT = path.resolve(HERE, '../e2e-output/design');

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
  const body = (await res.json()) as { users?: { localId: string }[] };
  const uid = body.users?.[0]?.localId;
  if (!uid) throw new Error(`no emulator account for ${email}`);
  return uid;
}

type Fields = Record<string, { integerValue?: string; stringValue?: string }>;

async function readDoc(docPath: string): Promise<Fields | null> {
  const res = await fetch(`${DOCS}/${docPath}`, { headers: OWNER });
  if (res.status === 404) return null;
  return ((await res.json()) as { fields: Fields }).fields;
}

/** Creates an account through the sign-in screen and lands in the demo editor with 20 credits. */
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

function probe(file: string) {
  const r = spawnSync(
    'ffprobe',
    ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', file],
    { encoding: 'utf8' },
  );
  if (r.status !== 0) throw new Error(`ffprobe failed: ${r.stderr}`);
  return JSON.parse(r.stdout) as {
    streams: { codec_type: string; codec_name: string; width?: number; height?: number }[];
    format: { format_name: string; duration: string };
  };
}

test.describe('Export (emulators, real job process)', () => {
  test.beforeEach(clearEmulators);

  test('charges the shown cost, renders, downloads, shares, and the share page plays', async ({
    page,
    browser,
    context,
  }) => {
    test.setTimeout(300_000);
    const errors = trackPageErrors(page);
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: AUTH_URL });
    const email = 'exporter@example.com';
    await signUp(page, email);
    const uid = await uidFor(email);

    await page.getByRole('button', { name: 'Export' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Export video' });
    await expect(dialog.getByText('Cost: 5 credits')).toBeVisible();
    await expect(dialog.getByText('20 available')).toBeVisible();
    // The cloud-mode options for the design check (the cost row the offline mode hides).
    await page.waitForTimeout(2_000);
    mkdirSync(DESIGN_OUT, { recursive: true });
    writeFileSync(
      path.join(DESIGN_OUT, 'export-cloud.actual.png'),
      await page.screenshot({ animations: 'disabled' }),
    );

    await dialog.getByRole('button', { name: 'Export video' }).click();
    // The balance drops by the cost that was shown, in the dialog's chip and in the ledger.
    await expect(page.getByRole('button', { name: '15 credits' })).toBeVisible({ timeout: 30_000 });
    const bar = page.getByRole('progressbar', { name: 'Export progress' });
    await expect(bar).toBeVisible({ timeout: 30_000 });

    await expect(page.getByRole('heading', { level: 3, name: 'Your video is ready' })).toBeVisible({
      timeout: 240_000,
    });
    const ready = page.getByRole('dialog', { name: 'Your video is ready' });
    await expect(ready.getByText('1080p · 16:9 · 18 sec')).toBeVisible();

    // The ledger holds exactly one export entry for 5 credits and no refund.
    const ledger = await fetch(`${DOCS}/users/${uid}/credits`, { headers: OWNER });
    const entries = ((await ledger.json()) as { documents?: { name: string }[] }).documents ?? [];
    const ids = entries.map((d) => d.name.split('/').pop() ?? '');
    expect(ids.filter((id) => id.startsWith('export-'))).toHaveLength(1);
    expect(ids.filter((id) => id.startsWith('refund-'))).toHaveLength(0);

    // Download (streamed through the route in emulator mode), then look at the file.
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      ready.getByRole('button', { name: 'Download video' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('Untitled Project.mp4');
    mkdirSync(OUT, { recursive: true });
    const file = path.join(OUT, 'emulator-16x9-1080p.mp4');
    await download.saveAs(file);
    const info = probe(file);
    const video = info.streams.find((s) => s.codec_type === 'video');
    expect([video?.width, video?.height]).toEqual([1920, 1080]);
    expect(Math.abs(Number(info.format.duration) - 18)).toBeLessThanOrEqual(0.1);

    // Copy share link, then open it in a fresh context (no cookies, no account).
    await ready.getByRole('button', { name: 'Copy share link' }).click();
    await expect(page.getByText('Link copied')).toBeVisible();
    const link = await page.evaluate(() => navigator.clipboard.readText());
    expect(link).toMatch(new RegExp(`^${AUTH_URL}/share/[A-Za-z0-9_-]{22}$`));

    const fresh = await browser.newContext({ baseURL: AUTH_URL });
    const shared = await fresh.newPage();
    const sharedErrors = trackPageErrors(shared);
    await shared.goto(link);
    await expect(shared.getByRole('heading', { level: 1, name: 'Untitled Project' })).toBeVisible();
    await expect(shared.getByText('Made with motionpop')).toBeVisible();
    await expect(shared.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    const player = shared.locator('video');
    await expect
      .poll(async () => player.evaluate((v: HTMLVideoElement) => v.videoWidth), {
        timeout: 60_000,
      })
      .toBe(1920);
    // A revoked or made-up link is the friendly not-found page.
    await shared.goto(`/share/${'x'.repeat(22)}`);
    await expect(shared.getByText("This video isn't here anymore.")).toBeVisible();
    await fresh.close();
    expect(sharedErrors).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('a failed render shows the error state and the credits come back', async ({ page }) => {
    test.setTimeout(240_000);
    const errors = trackPageErrors(page);
    const email = 'unlucky@example.com';
    await signUp(page, email);
    const uid = await uidFor(email);

    // Break the voiceover: the stored project points at audio that is not audio. The export
    // uploads it, the server accepts it (a Storage object of type audio/*), and the job's
    // ffprobe rejects it (`input-missing`), which refunds.
    await page.getByRole('button', { name: 'Rename project, Untitled Project' }).click();
    await page.getByLabel('Project title').fill('Broken voice');
    await page.keyboard.press('Enter');
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              new Promise<boolean>((resolve) => {
                const open = indexedDB.open('motionpop');
                open.onsuccess = () => {
                  const db = open.result;
                  const get = db.transaction('projects').objectStore('projects').get('demo');
                  get.onsuccess = () => {
                    db.close();
                    resolve(Boolean(get.result));
                  };
                  get.onerror = () => resolve(false);
                };
                open.onerror = () => resolve(false);
              }),
          ),
        { timeout: 20_000 },
      )
      .toBe(true);
    await page.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const open = indexedDB.open('motionpop');
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            const db = open.result;
            const tx = db.transaction(['projects', 'audio'], 'readwrite');
            const projects = tx.objectStore('projects');
            const get = projects.get('demo');
            get.onsuccess = () => {
              const stored = get.result as { current: { voiceover: { src: string } } };
              stored.current.voiceover.src = 'idb:audio-broken';
              projects.put(stored, 'demo');
              const garbage = new Uint8Array(4_000).fill(7).buffer;
              tx.objectStore('audio').put({ type: 'audio/wav', bytes: garbage }, 'audio-broken');
            };
            tx.oncomplete = () => {
              db.close();
              resolve();
            };
            tx.onerror = () => reject(tx.error);
          };
        }),
    );
    await page.reload();
    await expect(page.locator('[data-slot-id]').first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('button', { name: '20 credits' })).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: 'Export' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Export video' });
    await dialog.getByRole('button', { name: 'Export video' }).click();

    await expect(dialog.getByText("That one didn't make it")).toBeVisible({ timeout: 180_000 });
    await expect(dialog.getByRole('alert')).toHaveText(
      'Pip lost the voiceover on the way. Your credits are back.',
    );
    // The balance is back, and the ledger shows one spend and one refund.
    await expect(page.getByRole('button', { name: '20 credits' })).toBeVisible({ timeout: 30_000 });
    const ledger = await fetch(`${DOCS}/users/${uid}/credits`, { headers: OWNER });
    const entries = ((await ledger.json()) as { documents?: { name: string }[] }).documents ?? [];
    const ids = entries.map((d) => d.name.split('/').pop() ?? '');
    expect(ids.filter((id) => id.startsWith('export-'))).toHaveLength(1);
    const refund = ids.find((id) => id.startsWith('refund-'));
    expect(refund).toBeDefined();
    const refundDoc = await readDoc(`users/${uid}/credits/${refund}`);
    expect(refundDoc?.['balanceAfter']?.integerValue).toBe('20');
    expect(errors.filter((e) => !/voiceover/i.test(e))).toEqual([]);
  });
});
