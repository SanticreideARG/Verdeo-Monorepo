import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // jsdom, not node: every test here exercises DOM behaviour — form drafts, rendered components.
    environment: 'jsdom',
    globals: false,
    passWithNoTests: true,
    setupFiles: ['./src/test-setup.ts'],
  },
});
