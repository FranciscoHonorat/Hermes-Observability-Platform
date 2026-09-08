import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    env: {
      POSTGRES_PASSWORD: 'test',
      NODE_ENV: 'test',
      JWT_SECRET: 'test-jwt-secret'
    }
  }
});
