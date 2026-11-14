import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Next compiles with `jsx: preserve`; tests need a real JSX transform and the `@/` alias.
export default defineConfig({
  oxc: { jsx: { runtime: 'automatic' } },
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  test: { include: ['**/*.test.{ts,tsx}'], exclude: ['node_modules/**', '.next/**'] },
});
