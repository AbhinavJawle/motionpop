import { defineConfig } from 'vitest/config';

// Property tests do real work (hundreds of runs, some building DOM). Under the full forced suite,
// with every package testing at once on an 8-core laptop, several took 5–8 s and hit vitest's
// 5 s default (2026-11-15). The timeout is not a performance budget: timing tests assert
// their own budgets (best of N), so a generous timeout only stops load from failing them.
export default defineConfig({ test: { testTimeout: 20_000 } });
