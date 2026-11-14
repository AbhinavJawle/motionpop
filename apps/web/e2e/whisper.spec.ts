import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { trackPageErrors } from './helpers';

/**
 * Real on-device Whisper run (cold model download, about 80 s). Needs a short recorded speech
 * file of our own at e2e/fixtures/speech.{wav,mp3,m4a}; none is committed yet, and we don't
 * download or commit third-party audio.
 */
const FIXTURE_DIR = path.join(process.cwd(), 'e2e', 'fixtures');
const fixture = ['speech.wav', 'speech.mp3', 'speech.m4a']
  .map((n) => path.join(FIXTURE_DIR, n))
  .find((p) => existsSync(p));

test.skip(process.env.E2E_WHISPER !== '1', 'Set E2E_WHISPER=1 to run the real Whisper test.');
test.skip(
  !fixture,
  `A recorded speech sample is needed: add your own recording as e2e/fixtures/speech.wav (or .mp3/.m4a) ${
    existsSync(FIXTURE_DIR) ? `(found: ${readdirSync(FIXTURE_DIR).join(', ')})` : ''
  }`.trim(),
);

test('a real voiceover is transcribed and opens in the editor', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = trackPageErrors(page);
  await page.goto('/processing/new');
  await page.locator('input[type=file]').setInputFiles(fixture as string);
  await page.waitForURL(/\/editor\/p-[a-z0-9]+/, { timeout: 200_000 });
  await expect(page.getByText(/Voiceover · \d+\.\ds/)).toBeVisible({ timeout: 30_000 });
  expect(errors).toEqual([]);
});
