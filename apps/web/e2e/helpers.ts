import { expect, type Locator, type Page } from '@playwright/test';

/** Collects uncaught page errors so a spec can assert there were none. */
export function trackPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

export const slotCard = (page: Page, id: string): Locator => page.locator(`[data-slot-id="${id}"]`);
export const wordsTrack = (page: Page): Locator => page.getByRole('group', { name: 'Words' });
export const timecode = (page: Page): Locator => page.getByLabel('Current time');

/** Opens the editor and waits until the timeline has rendered its slots. */
export async function openEditor(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await expect(page.locator('[data-time-area]')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('[data-slot-id]').first()).toBeVisible({ timeout: 30_000 });
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox();
  if (!box) throw new Error('element has no bounding box');
  return box;
}

/** "m:ss.cs"-style timecode text to milliseconds-ish seconds (only used to compare order). */
export function timecodeToMs(text: string): number {
  const m = /(\d+):(\d+)(?:[.:](\d+))?/.exec(text);
  if (!m) throw new Error(`unexpected timecode "${text}"`);
  const frac = m[3] ?? '0';
  return (Number(m[1]) * 60 + Number(m[2])) * 1000 + Number(frac.padEnd(3, '0').slice(0, 3));
}
