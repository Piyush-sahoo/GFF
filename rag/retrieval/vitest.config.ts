import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // Indexing the full corpus happens once per suite; give it room.
    testTimeout: 30_000,
  },
});
