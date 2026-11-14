import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { openEditor, trackPageErrors } from './helpers';

/**
 * Design check: `/editor/demo?t=5600&select=slot-2` at 1440×900 (scale 2) against
 * `design/screens/editor.png`, region by region. The preview and inspector hold live content
 * that the static design only approximates, so only the chrome regions are asserted.
 */
test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DESIGN = path.resolve(HERE, '../../../design/screens/editor.png');
const OUT = path.resolve(HERE, '../e2e-output/design');

/** Regions in 2× pixels: [x, y, width, height]. */
const REGIONS: Record<string, [number, number, number, number]> = {
  'top-bar': [0, 0, 2880, 112],
  'tool-rail': [0, 112, 144, 1088],
  timeline: [0, 1200, 2880, 600],
};

/** Max share of differing pixels per region (pixelmatch threshold 0.1), from measured runs. */
const MAX_DIFF_PCT: Record<string, number> = {
  // Measured 2.54 / 2.47 / 9.11 %; about 1.5× headroom for font and compositing noise.
  'top-bar': 4,
  'tool-rail': 4,
  timeline: 14,
};

function crop(png: PNG, [x, y, w, h]: [number, number, number, number]): PNG {
  const out = new PNG({ width: w, height: h });
  PNG.bitblt(png, out, x, y, w, h, 0, 0);
  return out;
}

test('editor matches the design at 1440×900', async ({ page }) => {
  const errors = trackPageErrors(page);
  await openEditor(page, '/editor/demo?t=5600&select=slot-2');
  await page.evaluate(() => document.fonts.ready);
  // Let the entry springs, the waveform and the preview settle.
  await expect(page.getByLabel('Current time')).toHaveText('00:05.6');
  await page.waitForTimeout(2_500);

  mkdirSync(OUT, { recursive: true });
  const shot = await page.screenshot({ animations: 'disabled' });
  writeFileSync(path.join(OUT, 'editor.actual.png'), shot);
  writeFileSync(path.join(OUT, 'editor.design.png'), readFileSync(DESIGN));

  const actual = PNG.sync.read(shot);
  const design = PNG.sync.read(readFileSync(DESIGN));
  expect([actual.width, actual.height]).toEqual([design.width, design.height]);

  const report: Record<string, number> = {};
  const full = new PNG({ width: design.width, height: design.height });
  for (const [name, region] of Object.entries(REGIONS)) {
    const a = crop(actual, region);
    const d = crop(design, region);
    const diff = new PNG({ width: region[2], height: region[3] });
    const count = pixelmatch(a.data, d.data, diff.data, region[2], region[3], { threshold: 0.1 });
    PNG.bitblt(diff, full, 0, 0, region[2], region[3], region[0], region[1]);
    report[name] = (count / (region[2] * region[3])) * 100;
  }
  writeFileSync(path.join(OUT, 'editor.diff.png'), PNG.sync.write(full));
  writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(
    `design diff %: ${Object.entries(report)
      .map(([k, v]) => `${k}=${v.toFixed(2)}`)
      .join(' ')}`,
  );

  for (const [name, pct] of Object.entries(report)) {
    expect(pct, `${name} diff %`).toBeLessThanOrEqual(MAX_DIFF_PCT[name] ?? 0);
  }
  expect(errors).toEqual([]);
});
