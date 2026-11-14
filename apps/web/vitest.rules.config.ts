import { defineConfig } from 'vitest/config';

// Emulator-backed rules tests. Run through `pnpm test:rules` (firebase emulators:exec).
export default defineConfig({
  test: {
    include: ['rules/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // Both files share one Firestore/Storage emulator; run them one at a time.
    fileParallelism: false,
  },
});
