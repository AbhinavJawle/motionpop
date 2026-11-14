import { defineConfig, devices } from '@playwright/test';

/** Own ports: the everyday dev server uses 3123 and must not be touched. */
const PORT = 3200;
const AUTH_PORT = 3201;
const AUTH_EMULATOR_PORT = 9099;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const AUTH_URL = `http://127.0.0.1:${AUTH_PORT}`;

/**
 * Local mode: blank Firebase config so the editor specs run without an account or network.
 * Next keeps env vars that are already set (even empty) over `.env.local`.
 */
const LOCAL_ENV = {
  NEXT_PUBLIC_FIREBASE_API_KEY: '',
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: '',
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: '',
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: '',
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '',
  NEXT_PUBLIC_FIREBASE_APP_ID: '',
};

const desktop = { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } };

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
    { name: 'chromium', testIgnore: /auth\.spec\.ts/, use: desktop },
    // Real Firebase client against the Auth emulator (needs Java for the emulator).
    { name: 'auth', testMatch: /auth\.spec\.ts/, use: { ...desktop, baseURL: AUTH_URL } },
  ],
  webServer: [
    {
      // Own dist dir: `next dev` locks `.next/dev`, and 3123 already holds that lock.
      command: `NEXT_DIST_DIR=.next/e2e pnpm exec next dev -p ${PORT} --hostname 127.0.0.1`,
      url: `${BASE_URL}/editor/demo`,
      env: LOCAL_ENV,
      reuseExistingServer: false,
      timeout: 180_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: `npx -y firebase-tools@latest emulators:start --only auth --project motionpop-48409`,
      cwd: '../..',
      url: `http://127.0.0.1:${AUTH_EMULATOR_PORT}/`,
      reuseExistingServer: true,
      timeout: 180_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: `NEXT_DIST_DIR=.next/e2e-auth pnpm exec next dev -p ${AUTH_PORT} --hostname 127.0.0.1`,
      url: `${AUTH_URL}/sign-in`,
      env: { NEXT_PUBLIC_USE_FIREBASE_EMULATORS: 'true' },
      reuseExistingServer: false,
      timeout: 180_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});
