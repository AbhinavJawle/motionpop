import { expect, test, type Page } from '@playwright/test';
import { openEditor, trackPageErrors } from './helpers';

/**
 * The hybrid AI flows of the editor end to end (spec 09 task 21), in local mode with the fake AI
 * router and local credits (`NEXT_PUBLIC_FAKE_AI=1`, set on the `chromium` web server): edit a
 * field, quick edit on the device, restore a version, draw a note, the cloud chip, Generate, a
 * planned graphic, and offline. No page errors and no console errors in any of them.
 */
test.use({ viewport: { width: 1440, height: 900 } });

const mod = process.platform === 'darwin' ? 'Meta' : 'Control';

function watch(page: Page): string[] {
  const errors = trackPageErrors(page);
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 300)}`);
  });
  return errors;
}

const quick = (page: Page) => page.locator('[data-quick-edit-input]');
const generate = (page: Page) => page.getByRole('button', { name: /Generate/ });
const credits = (page: Page) => page.getByRole('button', { name: /^\d+ credits$/ });
const current = (page: Page, v: string) => page.getByLabel(`Current version ${v}`);
const value = (page: Page) => page.getByRole('textbox', { name: 'Value', exact: true });

/** The saved project of the demo, read from IndexedDB (what a reload would load). */
async function savedSlot(page: Page, slotId: string) {
  return page.evaluate(async (id) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open('motionpop');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const all = await new Promise<{ current: { slots: { id: string; timing?: unknown }[] } }[]>(
      (resolve, reject) => {
        const r = db.transaction('projects').objectStore('projects').getAll();
        r.onsuccess = () => resolve(r.result as never);
        r.onerror = () => reject(r.error);
      },
    );
    return all.flatMap((p) => p.current.slots).find((s) => s.id === id) ?? null;
  }, slotId);
}

test('edit a field, undo, quick edit on the device, restore a version', async ({ page }) => {
  const errors = watch(page);
  await openEditor(page, '/editor/demo?select=slot-2');
  await expect(current(page, 'v3')).toBeVisible();

  // The title field commits as a new version (v4); ⌘Z returns to v3.
  const label = page.getByRole('textbox', { name: 'Label' });
  await label.fill('Sales grew');
  await label.press('Enter');
  await expect(current(page, 'v4')).toBeVisible();
  await label.evaluate((el) => (el as HTMLInputElement).blur());
  await page.keyboard.press(`${mod}+z`);
  await expect(current(page, 'v3')).toBeVisible();
  await expect(label).toHaveValue('Revenue grew');

  // A quick edit on the device: the mint chip first, then the value and "Ready in".
  await expect(page.getByText('free · on-device')).toBeVisible();
  await quick(page).fill('change 40 to 45');
  await quick(page).press('Enter');
  await expect(page.getByText(/^Ready in \d+\.\ds$/)).toBeVisible({ timeout: 10_000 });
  await expect(value(page)).toHaveValue('45');
  await expect(current(page, 'v4')).toBeVisible();

  // Restoring v3 from its tile brings the 40 back.
  await page.getByRole('button', { name: 'v3', exact: true }).click();
  await expect(current(page, 'v3')).toBeVisible();
  await expect(value(page)).toHaveValue('40');
  expect(errors).toEqual([]);
});

test('draw a note, type "make it slower": it is fixed and timing.speed is 0.8 after reload', async ({
  page,
}) => {
  const errors = watch(page);
  await openEditor(page, '/editor/demo?t=5600&select=slot-2');
  await page.getByRole('button', { name: 'Draw a note' }).click();
  const box = (await page.locator('[data-draw-layer]').boundingBox())!;
  const at = (fx: number, fy: number) => [box.x + fx * box.width, box.y + fy * box.height] as const;
  await page.mouse.move(...at(0.42, 0.55));
  await page.mouse.down();
  for (let i = 1; i <= 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    await page.mouse.move(...at(0.3 + 0.12 * Math.cos(a), 0.55 + 0.2 * Math.sin(a)));
  }
  await page.mouse.up();
  const input = page.getByLabel('What should change?');
  await input.fill('make it slower');
  await input.press('Enter');
  const note = page.getByRole('group', { name: /^Note 2: make it slower/ });
  await expect(note).toContainText('✓ Fixed', { timeout: 10_000 });

  // Autosave writes it; the reload loads it back.
  await expect.poll(async () => (await savedSlot(page, 'slot-2'))?.timing).toEqual({ speed: 0.8 });
  await page.reload();
  await expect(page.locator('[data-slot-id]').first()).toBeVisible({ timeout: 30_000 });
  expect((await savedSlot(page, 'slot-2'))?.timing).toEqual({ speed: 0.8 });
  expect(errors).toEqual([]);
});

test('with the device off the quick edit shows ☁ 1', async ({ page }) => {
  const errors = watch(page);
  await openEditor(page, '/editor/demo?select=slot-2&device=off');
  await expect(page.getByLabel('1 credits, runs in the cloud').first()).toBeVisible();
  await expect(page.getByText('free · on-device')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Generate on slot 4 takes 3 credits and adds a "Generated" version', async ({ page }) => {
  const errors = watch(page);
  await openEditor(page, '/editor/demo?select=slot-4');
  await expect(credits(page)).toHaveAccessibleName('120 credits');
  await generate(page).click();
  await expect(page.getByText('Bringing it to life')).toBeVisible();
  await expect(page.getByText(/^Ready in \d+\.\ds$/)).toBeVisible({ timeout: 15_000 });
  await expect(credits(page)).toHaveAccessibleName('117 credits');
  await expect(page.getByRole('button', { name: 'Generated (current)' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('a planned graphic (slot 1) has Generate disabled with "Coming soon"', async ({ page }) => {
  const errors = watch(page);
  await openEditor(page, '/editor/demo?select=slot-1');
  await expect(generate(page)).toBeDisabled();
  await generate(page).locator('xpath=..').hover();
  await expect(page.getByRole('tooltip').getByText('Coming soon')).toBeVisible();
  expect(errors).toEqual([]);
});

test('offline: the banner shows, Generate says "Needs connection", a device quick edit still lands', async ({
  page,
  context,
}) => {
  const errors = watch(page);
  await openEditor(page, '/editor/demo?select=slot-2');
  await context.setOffline(true);
  await expect(page.getByRole('status').filter({ hasText: /offline/i })).toBeVisible();
  await expect(generate(page)).toBeDisabled();
  await generate(page).locator('xpath=..').hover();
  await expect(page.getByRole('tooltip').getByText('Needs connection')).toBeVisible();

  await quick(page).fill('make it faster');
  await quick(page).press('Enter');
  await expect(page.getByRole('button', { name: 'make it faster (current)' })).toBeVisible({
    timeout: 10_000,
  });
  await context.setOffline(false);
  // Going offline stops the dev server's lazy chunks (a worker script, a resource): that is the
  // network failing, not the app. Anything else is an error.
  expect(errors.filter((e) => !/ERR_INTERNET_DISCONNECTED|importScripts/.test(e))).toEqual([]);
});
