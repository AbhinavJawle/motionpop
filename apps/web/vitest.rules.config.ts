import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

// Emulator-backed rules tests. Run through `pnpm test:rules` (firebase emulators:exec).
export default defineConfig({
  resolve: {
    // `server-only` throws outside a React Server environment; tests import server modules directly.
    alias: { 'server-only': resolve(import.meta.dirname, 'rules/empty-module.ts') },
  },
  test: {
    include: ['rules/**/*.test.ts'],
    environment: 'node',
    // Skip the GCE metadata probe: with no credentials it adds seconds to every Admin call.
    env: { METADATA_SERVER_DETECTION: 'none' },
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // All files share one Firestore/Storage emulator; run them one at a time.
    fileParallelism: false,
  },
});
