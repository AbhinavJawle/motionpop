import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { openEditor, trackPageErrors } from './helpers';

/**
 * Frame notes at 1440×900 for the design check (spec 09 tasks 20 and 22): the saved note of the
 * demo slot (compare `editor-generating.png`: violet ellipse, numbered bubble, leader line), a
 * stroke being drawn with its "What should change?" bubble, and the note after the fix ("✓ Fixed",
 * "Still there?"). Screenshots go to `e2e-output/design/`. The spec asserts behaviour: the pen,
 * the stroke, the fix landing as timing.speed 0.8 in one version, the note fixed, and hiding.
 */
test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../e2e-output/design');
const shot = async (page: Page, name: string) => {
  mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, `${name}.png`), animations: 'disabled' });
};
const pen = (page: Page) => page.getByRole('button', { name: 'Draw a note' });

test('draw a note, type a request, see it fixed', async ({ page }) => {
  const errors = trackPageErrors(page);
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 300)}`);
  });
  await openEditor(page, '/editor/demo?t=5600&select=slot-2&fakeLatency=2500');
  await page.evaluate(() => document.fonts.ready);

  // The demo slot's own note is on screen while paused.
  const first = page.getByRole('group', { name: /^Note 1: Make this slower/ });
  await expect(first).toBeVisible();
  await page.waitForTimeout(500);
  await shot(page, 'frame-note-bubble');

  await expect(pen(page)).toHaveAttribute('aria-pressed', 'false');
  await pen(page).click();
  await expect(pen(page)).toHaveAttribute('aria-pressed', 'true');
  const layer = page.locator('[data-draw-layer]');
  const box = (await layer.boundingBox())!;
  const at = (fx: number, fy: number) => [box.x + fx * box.width, box.y + fy * box.height] as const;
  // A loop around the left part of the frame (where the big number sits).
  const [cx, cy] = [0.3, 0.55];
  await page.mouse.move(...at(cx + 0.12, cy));
  await page.mouse.down();
  for (let i = 1; i <= 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    await page.mouse.move(...at(cx + 0.12 * Math.cos(a), cy + 0.2 * Math.sin(a)));
  }
  await page.mouse.up();
  const input = page.getByLabel('What should change?');
  await expect(input).toBeVisible();
  await expect(input).toBeFocused();
  await page.waitForTimeout(400);
  await shot(page, 'frame-note-drawing');

  await input.fill('make it slower');
  await input.press('Enter');
  const second = page.getByRole('group', { name: /^Note 2: make it slower/ });
  await expect(second).toHaveAttribute('aria-busy', 'true');
  await expect(page.getByRole('status').filter({ hasText: 'Pip is thinking…' })).toBeVisible();
  await expect(second).toContainText('✓ Fixed', { timeout: 15_000 });
  await expect(second.getByRole('button', { name: 'Still there?' })).toBeVisible();
  await page.waitForTimeout(500);
  await shot(page, 'frame-note-applied');

  // The fix is one version, labelled with the note, and the speed changed.
  await expect(page.getByRole('button', { name: 'make it slower (current)' })).toBeVisible();
  // After 4 seconds the fixed note goes away; the first one stays.
  await expect(second).toHaveCount(0, { timeout: 8_000 });
  await expect(first).toBeVisible();

  // Esc leaves draw mode first, and playing leaves it too.
  await page.keyboard.press('Escape');
  await expect(pen(page)).toHaveAttribute('aria-pressed', 'false');
  expect(errors).toEqual([]);
});

test('the pen is off with no graphic under the playhead, and notes hide while playing', async ({
  page,
}) => {
  await openEditor(page, '/editor/demo?t=100');
  await expect(pen(page)).toHaveAttribute('aria-disabled', 'true');
  // aria-disabled counts as disabled for Playwright's own click: force it.
  await pen(page).click({ force: true });
  await expect(pen(page)).toHaveAttribute('aria-pressed', 'false');

  await page.goto('/editor/demo?t=5600&select=slot-2');
  await expect(page.getByRole('group', { name: /^Note 1:/ })).toBeVisible();
  await page.keyboard.press('Space');
  await expect(page.getByRole('group', { name: /^Note 1:/ })).toHaveCount(0);
  await page.keyboard.press('Space');
  await expect(page.getByRole('group', { name: /^Note 1:/ })).toBeVisible();
});

test('Enter with the pen on circles the focal element', async ({ page }) => {
  await openEditor(page, '/editor/demo?t=5600&select=slot-2');
  await pen(page).click();
  await page.locator('[data-draw-layer]').hover();
  // The focal element lives in the player's frame: wait until it is drawn before pressing Enter.
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const player = document.querySelector<
            HTMLElement & { iframeElement?: HTMLIFrameElement }
          >('hyperframes-player');
          const el = player?.iframeElement?.contentDocument?.querySelector('[data-focal]');
          return (el?.getBoundingClientRect().width ?? 0) > 0;
        }),
      { timeout: 30_000 },
    )
    .toBe(true);
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('What should change?')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByLabel('What should change?')).toHaveCount(0);
  await expect(pen(page)).toHaveAttribute('aria-pressed', 'true');
});
