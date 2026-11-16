import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { openEditor, trackPageErrors } from './helpers';

/**
 * Spike for the frame capture (spec 09 task 19): does redrawing the paused composition through an
 * SVG foreignObject work in the preview player, how long does it take, does `toDataURL` throw
 * (tainting), and does the crop look like the player. Three stills in 16:9 and in 9:16, the whole
 * frame and a crop. The images and the numbers go to `e2e-output/spike/` for eyes.
 */
test.use({ viewport: { width: 1440, height: 900 } });

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../e2e-output/spike');
const STILLS = [5600, 6600, 14_500];
const REGIONS = {
  full: { x: 0, y: 0, w: 1, h: 1 },
  crop: { x: 0.15, y: 0.25, w: 0.5, h: 0.5 },
};

interface Capture {
  url: string | null;
  ms: number;
}

for (const format of ['16:9', '9:16'] as const) {
  test(`capture is fast, untainted and like the player in ${format}`, async ({ page }) => {
    const errors = trackPageErrors(page);
    mkdirSync(OUT, { recursive: true });
    await openEditor(page, '/editor/demo');
    await page.waitForFunction(() => '__capture' in window);
    const rows: Record<string, number | string>[] = [];

    for (const t of STILLS) {
      await openStill(page, t, format);
      const player = page.locator('hyperframes-player');
      const shot = (await player.screenshot()).toString('base64');
      for (const [name, region] of Object.entries(REGIONS)) {
        // The first call includes the browser's one-off setup; the second is the steady state.
        const first = await page.evaluate<Capture, typeof region>(
          (r) => window.__capture(r),
          region,
        );
        const again = await page.evaluate<Capture, typeof region>(
          (r) => window.__capture(r),
          region,
        );
        expect(first.url, `${format} ${t} ${name}: capture returned an image`).not.toBeNull();
        const file = `${format.replace(':', 'x')}-${t}-${name}`;
        writeFileSync(
          path.join(OUT, `${file}.jpg`),
          Buffer.from(first.url!.split(',')[1]!, 'base64'),
        );
        writeFileSync(path.join(OUT, `${file}.player.png`), Buffer.from(shot, 'base64'));
        // Compare with the player's own pixels, both scaled to 160 px wide on the same crop.
        const diff = await page.evaluate(
          async ({ url, shot, region }) => {
            const load = async (src: string) => {
              const img = new Image();
              img.src = src;
              await img.decode();
              return img;
            };
            const cap = await load(url);
            const ply = await load(`data:image/png;base64,${shot}`);
            const W = 160;
            const H = Math.round((W * cap.height) / cap.width);
            const draw = (img: HTMLImageElement, crop: boolean) => {
              const c = document.createElement('canvas');
              c.width = W;
              c.height = H;
              const g = c.getContext('2d')!;
              if (crop) {
                g.drawImage(
                  img,
                  region.x * img.width,
                  region.y * img.height,
                  region.w * img.width,
                  region.h * img.height,
                  0,
                  0,
                  W,
                  H,
                );
              } else g.drawImage(img, 0, 0, W, H);
              return g.getImageData(0, 0, W, H).data;
            };
            const a = draw(cap, false);
            const b = draw(ply, true);
            let sum = 0;
            let far = 0;
            for (let i = 0; i < a.length; i += 4) {
              const d =
                (Math.abs(a[i]! - b[i]!) +
                  Math.abs(a[i + 1]! - b[i + 1]!) +
                  Math.abs(a[i + 2]! - b[i + 2]!)) /
                3;
              sum += d;
              if (d > 40) far++;
            }
            return { mean: sum / (a.length / 4), farPct: (100 * far) / (a.length / 4) };
          },
          { url: first.url!, shot, region },
        );
        rows.push({
          format,
          t,
          region: name,
          firstMs: Math.round(first.ms),
          steadyMs: Math.round(again.ms),
          kb: Math.round((first.url!.length * 0.75) / 1024),
          meanDiff: Number(diff.mean.toFixed(2)),
          farPct: Number(diff.farPct.toFixed(2)),
        });
        // Like the player: the mean channel difference after scaling stays small (measured ≤ 4.6
        // of 255, at most 3.4 % of pixels differ by more than 40), with room for other machines.
        expect(diff.mean, `${file} mean difference`).toBeLessThan(10);
        expect(diff.farPct, `${file} differing pixels %`).toBeLessThan(10);
        // Target: under 300 ms steady state (a generous 1 s bound here, CI machines are slower).
        expect(again.ms, `${file} steady-state time`).toBeLessThan(1000);
      }
    }
    writeFileSync(
      path.join(OUT, `report-${format.replace(':', 'x')}.json`),
      JSON.stringify(rows, null, 2),
    );
    console.log(JSON.stringify(rows));
    expect(errors).toEqual([]);
  });
}

async function openStill(
  page: import('@playwright/test').Page,
  t: number,
  format: '16:9' | '9:16',
): Promise<void> {
  await page.goto(`/editor/demo?t=${t}`);
  await expect(page.locator('[data-slot-id]').first()).toBeVisible({ timeout: 30_000 });
  await page.waitForFunction(() => '__capture' in window);
  if (format !== '16:9') {
    await page.getByRole('radio', { name: format }).click();
    await expect(page.getByRole('radio', { name: format })).toBeChecked();
  }
  await page.waitForTimeout(1_500); // the player seeks and the composition paints
}

declare global {
  interface Window {
    __capture(region: { x: number; y: number; w: number; h: number }): Promise<Capture>;
  }
}
