import { defineConfig } from 'vitest/config';

// The ffmpeg and fault-injection tests start real processes and are slow when `turbo` runs every
// package's tests at once; the default 5 s timed out under that load (spec 13 task 1 run).
export default defineConfig({ test: { testTimeout: 30_000, hookTimeout: 30_000 } });
