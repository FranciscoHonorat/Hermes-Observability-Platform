import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    env: {
      // alertEngine.ts pulls in ./config and ./database at import time,
      // which require these to be set even though this suite never opens
      // a real connection.
      POSTGRES_PASSWORD: 'test'
    }
  }
});
