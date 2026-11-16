import { defineConfig, devices } from '@playwright/test';

/** Own ports: the everyday dev server uses 3123 and must not be touched. */
const PORT = 3200;
const AUTH_PORT = 3201;
/** Offline mode with `MP_RENDER_FAKE_FAIL=producer`: the failing-render path of the export spec. */
const FAIL_PORT = 3202;
const AUTH_EMULATOR_PORT = 9099;
const FIRESTORE_EMULATOR_PORT = 8080;
const STORAGE_EMULATOR_PORT = 9199;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const AUTH_URL = `http://127.0.0.1:${AUTH_PORT}`;
const FAIL_URL = `http://127.0.0.1:${FAIL_PORT}`;

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

/** Placeholder web config for the auth project on CI (Auth + Firestore emulators only). */
const EMULATOR_WEB_CONFIG = {
  NEXT_PUBLIC_FIREBASE_API_KEY: 'emulator-api-key',
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'motionpop-48409.firebaseapp.com',
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'motionpop-48409',
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: 'motionpop-48409.firebasestorage.app',
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '0',
  NEXT_PUBLIC_FIREBASE_APP_ID: '1:0:web:emulator',
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
    { name: 'chromium', testIgnore: /(auth|export-emulator|credits)\.spec\.ts/, use: desktop },
    // Real Firebase client against the Auth, Firestore and Storage emulators (needs Java). The
    // export spec adds the real job entry point as a child process (spec 08 task 19).
    {
      name: 'auth',
      testMatch: /(auth|export-emulator|credits)\.spec\.ts/,
      use: { ...desktop, baseURL: AUTH_URL },
    },
  ],
  webServer: [
    {
      // Own dist dir: `next dev` locks `.next/dev`, and 3123 already holds that lock.
      command: `NEXT_DIST_DIR=.next/e2e pnpm exec next dev -p ${PORT} --hostname 127.0.0.1`,
      url: `${BASE_URL}/editor/demo`,
      // The fake AI router and local credits (spec 09 task 11): the editor specs run the AI flows
      // without Firebase. Set for this dev server only, never for the auth server (it needs the
      // real credits client, spec 13 task 17) and never in a build (P9 test).
      env: { ...LOCAL_ENV, NEXT_PUBLIC_FAKE_AI: '1' },
      reuseExistingServer: false,
      timeout: 180_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: `npx -y firebase-tools@latest emulators:start --only auth,firestore,storage --project motionpop-48409`,
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
      // Offline mode again, with the producer made to fail (only `offlineDeps` reads the variable).
      command: `NEXT_DIST_DIR=.next/e2e-fail pnpm exec next dev -p ${FAIL_PORT} --hostname 127.0.0.1`,
      url: `${FAIL_URL}/editor/demo`,
      env: { ...LOCAL_ENV, MP_RENDER_FAKE_FAIL: 'producer' },
      reuseExistingServer: false,
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
        // Storage (the export spec uploads the voice and the job writes the video there).
        FIREBASE_STORAGE_EMULATOR_HOST: `127.0.0.1:${STORAGE_EMULATOR_PORT}`,
        STORAGE_BUCKET: 'motionpop-48409.firebasestorage.app',
        GOOGLE_CLOUD_PROJECT: 'motionpop-48409',
        // Without credentials the Admin SDK probes the GCE metadata server (~5 s per first call).
        METADATA_SERVER_DETECTION: 'none',
        JUDGE_EMAILS: 'judge@example.com',
        // CI has no `.env.local`: a placeholder web config (the emulators accept any key), so the
        // app runs with Firebase on instead of falling back to local mode. Never a real config.
        ...(process.env['CI'] ? EMULATOR_WEB_CONFIG : {}),
      },
      reuseExistingServer: false,
      timeout: 180_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});
