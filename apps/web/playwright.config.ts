import { defineConfig, devices } from '@playwright/test';

/** Own ports: the everyday dev server uses 3123 and must not be touched. */
const PORT = 3200;
const AUTH_PORT = 3201;
const AUTH_EMULATOR_PORT = 9099;
const FIRESTORE_EMULATOR_PORT = 8080;
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
  // On CI the `github` reporter turns failures into check annotations (readable without logs).
  reporter: [
    ...(process.env['CI'] ? ([['github']] as const) : []),
    ['list'],
    ['html', { outputFolder: 'e2e-output/report', open: 'never' }],
  ],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', testIgnore: /auth\.spec\.ts/, use: desktop },
    // Real Firebase client against the Auth + Firestore emulators (needs Java).
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
      command: `npx -y firebase-tools@latest emulators:start --only auth,firestore --project motionpop-48409`,
      cwd: '../..',
      url: `http://127.0.0.1:${AUTH_EMULATOR_PORT}/`,
      reuseExistingServer: true,
      // SIGTERM lets firebase-tools stop its Java emulators; the default hard kill orphaned them.
      gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 },
      timeout: 180_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: `NEXT_DIST_DIR=.next/e2e-auth pnpm exec next dev -p ${AUTH_PORT} --hostname 127.0.0.1`,
      url: `${AUTH_URL}/sign-in`,
      env: {
        NEXT_PUBLIC_USE_FIREBASE_EMULATORS: 'true',
        // Admin SDK (bootstrap route) talks to the emulators and needs no credentials.
        FIREBASE_AUTH_EMULATOR_HOST: `127.0.0.1:${AUTH_EMULATOR_PORT}`,
        FIRESTORE_EMULATOR_HOST: `127.0.0.1:${FIRESTORE_EMULATOR_PORT}`,
        GOOGLE_CLOUD_PROJECT: 'motionpop-48409',
        // Without credentials the Admin SDK probes the GCE metadata server (~5 s per first call).
        METADATA_SERVER_DETECTION: 'none',
        JUDGE_EMAILS: 'judge@example.com',
      },
      reuseExistingServer: false,
      timeout: 180_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});
