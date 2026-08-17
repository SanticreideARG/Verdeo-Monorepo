import { defineConfig } from 'tsup';

export default defineConfig({
  clean: true,
  entry: ['src/server.ts'],
  external: ['pino', 'pino-pretty'],
  format: ['esm'],
  noExternal: [/^@verdeo\//],
  platform: 'node',
  target: 'node22',
});
