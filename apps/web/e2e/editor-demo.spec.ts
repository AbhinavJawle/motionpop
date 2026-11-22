import { expect, test } from '@playwright/test';
import {
  boxOf,
  openEditor,
  slotCard,
  timecode,
  timecodeToMs,
  trackPageErrors,
  wordsTrack,
} from './helpers';

test('editor demo path: play, seek, drag + undo, shift-drag create, autosave, reload', async ({
  page,
}) => {
  const errors = trackPageErrors(page);
  await openEditor(page, '/editor/demo');

  // Selecting a slot opens the graphic inspector.
  await expect(page.locator('[data-slot-id]')).toHaveCount(4);
  await slotCard(page, 'slot-2').click();
  await expect(page.getByLabel('Graphic inspector')).toBeVisible();

  // Play advances the timecode.
  const before = timecodeToMs((await timecode(page).textContent()) ?? '');
  await page.getByRole('button', { name: 'Play voiceover' }).click();
  await expect
    .poll(async () => timecodeToMs((await timecode(page).textContent()) ?? ''), {
      timeout: 10_000,
    })
    .toBeGreaterThan(before + 500);
  await page.getByRole('button', { name: 'Pause' }).click();

  // Clicking a word seeks to it ("2020." starts at 7.5 s).
  await wordsTrack(page).getByRole('button', { name: '2020.', exact: true }).click();
  await expect
    .poll(async () => timecodeToMs((await timecode(page).textContent()) ?? ''))
    .toBeGreaterThanOrEqual(7400);
  expect(timecodeToMs((await timecode(page).textContent()) ?? '')).toBeLessThanOrEqual(7600);

  // Dragging slot 2 changes its range; ⌘Z restores it.
  const slot2 = slotCard(page, 'slot-2');
  const start = await boxOf(slot2);
  const cx = start.x + start.width / 2;
  const cy = start.y + start.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 20, cy, { steps: 4 });
  await page.mouse.move(cx + 70, cy, { steps: 8 });
  await page.mouse.up();
  const moved = await boxOf(slot2);
  expect(Math.abs(moved.x - start.x)).toBeGreaterThan(20);

  await page.keyboard.press('ControlOrMeta+z');
  await expect
    .poll(async () => Math.abs((await boxOf(slot2)).x - start.x), { timeout: 5_000 })
    .toBeLessThan(2);
  expect(Math.abs((await boxOf(slot2)).width - start.width)).toBeLessThan(2);

  // Shift-drag on "Our": the 1 s gap between slots 1 and 2 is shorter than any graphic (a hook
  // needs 2.4 s since spec 07), so it is refused with a reason.
  const shiftDrag = async (name: string) => {
    const b = await boxOf(wordsTrack(page).getByRole('button', { name, exact: true }));
    await page.keyboard.down('Shift');
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2 + 4, b.y + b.height / 2, { steps: 3 });
    await page.mouse.up();
    await page.keyboard.up('Shift');
  };
  await shiftDrag('Our');
  await expect(page.getByText(/no room for one/)).toBeVisible();
  await expect(page.locator('[data-slot-id]')).toHaveCount(4);

  // Deleting slot 3 frees "And this is only the beginning"; shift-drag there adds a slot.
  await slotCard(page, 'slot-3').click();
  await page.keyboard.press('Delete');
  await expect(page.locator('[data-slot-id]')).toHaveCount(3);
  await shiftDrag('only');
  await expect(page.locator('[data-slot-id]')).toHaveCount(4);

  // Autosave settles, and the new slot survives a reload.
  await expect(page.getByRole('status').filter({ hasText: 'All changes saved' })).toBeVisible({
    timeout: 10_000,
  });
  await page.waitForTimeout(1_000);
  await expect(page.getByRole('status').filter({ hasText: 'All changes saved' })).toBeVisible();
  await page.reload();
  await expect(page.locator('[data-slot-id]').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-slot-id]')).toHaveCount(4);
  // The saved project, not the fixture: slot 3 is gone and the new slot is there.
  await expect(page.locator('[data-slot-id="slot-3"]')).toHaveCount(0);

  expect(errors).toEqual([]);
});
