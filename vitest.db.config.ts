import { defineConfig } from 'vitest/config';

// Database tests run against a real PostgreSQL instance (see tests/db/README.md).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/db/**/*.test.ts'],
    testTimeout: 60000,
    hookTimeout: 60000,
    fileParallelism: false,
  },
});
