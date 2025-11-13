import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    globals: true
  },
  resolve: {
    alias: {
      $lib: resolve(__dirname, 'src/lib')
    }
  }
});
