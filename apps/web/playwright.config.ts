import { defineConfig, devices } from '@playwright/test';

/** Own port: the everyday dev server uses 3123 and must not be touched. */
const PORT = 3200;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e-output/results',
  // The specs measure timing and pixels: run them one at a time.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  reporter: [['list'], ['html', { outputFolder: 'e2e-output/report', open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    // Own dist dir: `next dev` locks `.next/dev`, and 3123 already holds that lock.
    command: `NEXT_DIST_DIR=.next/e2e pnpm exec next dev -p ${PORT} --hostname 127.0.0.1`,
    url: `${BASE_URL}/editor/demo`,
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
