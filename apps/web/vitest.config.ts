import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Next compiles with `jsx: preserve`; tests need a real JSX transform and the `@/` alias.
export default defineConfig({
  oxc: { jsx: { runtime: 'automatic' } },
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  test: {
    // Not a performance budget (timing tests assert their own): under the full forced suite
    // property tests took 5–8 s and hit the 5 s default (2026-11-15).
    testTimeout: 20_000,
    include: ['**/*.test.{ts,tsx}'],
    exclude: ['node_modules/**', '.next/**', 'e2e/**', 'rules/**'],
  },
});
