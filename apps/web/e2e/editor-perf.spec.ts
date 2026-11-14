import { expect, test } from '@playwright/test';
import { openEditor, trackPageErrors, wordsTrack } from './helpers';

/** Performance page (spec 04 NFR): 50 slots, 3,000 words, about 16 minutes. */
const MAX_WORD_BUTTONS = 600;
const MAX_P95_MS = 34;

test('perf: 60 fps playback and a bounded words track on /editor/perf', async ({ page }) => {
  const errors = trackPageErrors(page);
  await openEditor(page, '/editor/perf');

  const wordButtons = () => wordsTrack(page).getByRole('button').count();

  // At fit (the whole 16 minutes in view).
  await expect.poll(wordButtons).toBeGreaterThan(0);
  const atFit = await wordButtons();
  console.log(`word buttons at fit: ${atFit}`);
  expect(atFit).toBeLessThan(MAX_WORD_BUTTONS);

  // Zoomed in.
  const zoomIn = page.getByRole('button', { name: 'Zoom in' });
  for (let i = 0; i < 4; i++) await zoomIn.click();
  await page.waitForTimeout(300);
  const zoomed = await wordButtons();
  console.log(`word buttons zoomed in: ${zoomed}`);
  expect(zoomed).toBeGreaterThan(0);
  expect(zoomed).toBeLessThan(MAX_WORD_BUTTONS);

  // Frame intervals while playing.
  await page.getByRole('button', { name: 'Play voiceover' }).click();
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  const intervals = await page.evaluate(
    () =>
      new Promise<number[]>((resolve) => {
        const out: number[] = [];
        let last = performance.now();
        const t0 = last;
        const tick = (now: number) => {
          out.push(now - last);
          last = now;
          if (now - t0 < 5_000) requestAnimationFrame(tick);
          else resolve(out);
        };
        requestAnimationFrame(tick);
      }),
  );
  await page.getByRole('button', { name: 'Pause' }).click();

  const sorted = intervals.slice(5).sort((a, b) => a - b); // skip warm-up frames
  const pick = (q: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
  const median = pick(0.5);
  const p95 = pick(0.95);
  console.log(
    `frame interval ms: median=${median.toFixed(2)} p95=${p95.toFixed(2)} frames=${sorted.length}`,
  );
  expect(sorted.length).toBeGreaterThan(100);
  expect(p95).toBeLessThan(MAX_P95_MS);

  // Still bounded after playing (the view may have followed the playhead).
  expect(await wordButtons()).toBeLessThan(MAX_WORD_BUTTONS);
  expect(errors).toEqual([]);
});
