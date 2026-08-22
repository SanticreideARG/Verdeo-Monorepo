import { defineConfig } from 'vitest/config';

// Migration rehearsals boot a real PostgreSQL engine per test, which the 5s default does not fit.
export default defineConfig({
  test: { environment: 'node', hookTimeout: 30_000, passWithNoTests: true, testTimeout: 30_000 },
});
