import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    env: {
      POSTGRES_PASSWORD: 'test',
      NODE_ENV: 'test',
      API_ADMIN_TOKEN: 'test-admin-token'
    }
  }
});
