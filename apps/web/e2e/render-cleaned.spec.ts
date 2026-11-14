import { expect, test, type Page } from '@playwright/test';
import { trackPageErrors } from './helpers';

const SAMPLE_RATE = 24_000;
const DURATION_MS = 3000;
const CUTS = [
  { startMs: 800, endMs: 1200 },
  { startMs: 2000, endMs: 2100 },
];
const CLEANED_MS = DURATION_MS - 400 - 100;
/** Output times of the two seams (cuts removed before them). */
const SEAMS_MS = [800, 1600];

interface Result {
  length: number;
  identical: boolean;
  maxJumps: number[];
  maxJumpOverall: number;
}

async function run(page: Page, cuts: typeof CUTS): Promise<Result> {
  return page.evaluate(
    async ({ cuts, sampleRate, durationMs, seams }) => {
      const hook = (
        window as unknown as {
          __audioTest: {
            renderCleaned: (
              pcm: Float32Array,
              sr: number,
              cuts: Array<{ startMs: number; endMs: number }>,
            ) => Promise<Float32Array>;
          };
        }
      ).__audioTest;
      // 440 Hz at 0.3: its own steepest step is about 0.035, well below the 0.05 limit.
      const n = Math.round((durationMs * sampleRate) / 1000);
      const pcm = new Float32Array(n);
      for (let i = 0; i < n; i++) pcm[i] = 0.3 * Math.sin((2 * Math.PI * 440 * i) / sampleRate);
      const input = pcm.slice();
      const out = await hook.renderCleaned(pcm, sampleRate, cuts);
      const jumpIn = (centreMs: number) => {
        const c = Math.round((centreMs * sampleRate) / 1000);
        const w = Math.round((10 * sampleRate) / 1000);
        let max = 0;
        for (let i = Math.max(1, c - w); i <= Math.min(out.length - 1, c + w); i++) {
          max = Math.max(max, Math.abs((out[i] ?? 0) - (out[i - 1] ?? 0)));
        }
        return max;
      };
      let overall = 0;
      for (let i = 1; i < out.length; i++) {
        overall = Math.max(overall, Math.abs((out[i] ?? 0) - (out[i - 1] ?? 0)));
      }
      return {
        length: out.length,
        identical: out.length === input.length && out.every((v, i) => v === input[i]),
        maxJumps: seams.map(jumpIn),
        maxJumpOverall: overall,
      };
    },
    { cuts, sampleRate: SAMPLE_RATE, durationMs: DURATION_MS, seams: SEAMS_MS },
  );
}

test.describe('renderCleaned in the browser', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dev/audio-test');
    await page.waitForFunction(() => '__audioTest' in window, undefined, { timeout: 60_000 });
  });

  test('length matches cleanedDuration and the seams do not click', async ({ page }) => {
    const errors = trackPageErrors(page);
    const r = await run(page, CUTS);
    const expected = Math.round((CLEANED_MS * SAMPLE_RATE) / 1000);
    console.log(
      `renderCleaned: length ${r.length} (expected ${expected}), seam jumps ${r.maxJumps
        .map((j) => j.toFixed(4))
        .join(', ')}, overall max ${r.maxJumpOverall.toFixed(4)}`,
    );
    expect(Math.abs(r.length - expected)).toBeLessThanOrEqual(1);
    for (const j of r.maxJumps) expect(j).toBeLessThan(0.05);
    expect(errors).toEqual([]);
  });

  test('with no cuts the input comes back unchanged', async ({ page }) => {
    const r = await run(page, []);
    expect(r.length).toBe((DURATION_MS * SAMPLE_RATE) / 1000);
    expect(r.identical).toBe(true);
  });
});
