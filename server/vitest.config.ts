import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    setupFiles: ['test/setup.ts'],
    // The first run downloads a MongoDB binary for mongodb-memory-server.
    hookTimeout: 120_000,
    testTimeout: 20_000,
    env: {
      NODE_ENV: 'test',
      JWT_SECRET: 'test-jwt-secret',
      DATA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
      CLIENT_URL: 'http://localhost:3000',
      STRIPE_SECRET_KEY: 'sk_test_dummy',
      STRIPE_WEBHOOK_SECRET: 'whsec_test_secret',
    },
  },
});
